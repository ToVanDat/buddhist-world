import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import {
  SOCKET_EVENTS as E, joinRegionPayload, playerStatePayload, chatSendPayload,
  getRegion, TICK_RATE_HZ, type RegionDef, type Vec3,
  type RemotePlayerSnapshot, type ChatMessage,
} from "@bw/shared";
import { env } from "../config/env.js";
import { verifyAccess } from "../lib/tokens.js";
import { isSessionActive } from "../lib/sessions.js";
import { pool } from "../db/pool.js";
import { redis } from "../lib/redis.js";
import { hit } from "../lib/rateLimit.js";
import { logger } from "../lib/logger.js";
import { resolveSavedLocation, validateMove } from "./movement.js";
import { buildInterestIndex, findNearbyPlayers } from "./interest.js";

interface Player {
  userId: string; name: string; socketId: string;
  region: RegionDef; spawnId: string; pos: Vec3; yaw: number; anim: RemotePlayerSnapshot["anim"];
  lastStateAt: number; lastSeq: number;
}

/** Trạng thái authoritative của một instance. Redis presence hỗ trợ quan sát; chưa phải adapter đa instance. */
const players = new Map<string, Player>();
// Tracks the newest socket even before it joins a region, preventing stale disconnect cleanup races.
const latestSocketByUser = new Map<string, string>();
const pendingLocationWrites = new Map<string, Promise<void>>();

function persistPlayerLocation(player: Player): Promise<void> {
  const previousWrite = pendingLocationWrites.get(player.userId);
  // Serialize writes per player so an older snapshot can never finish after a newer one.
  const write = (previousWrite?.catch(() => {}) ?? Promise.resolve()).then(() =>
    pool.query(
      `INSERT INTO player_locations (user_id, region_id, spawn_id, x, y, z, yaw)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET region_id=EXCLUDED.region_id,
         spawn_id=CASE WHEN player_locations.region_id=EXCLUDED.region_id THEN player_locations.spawn_id ELSE EXCLUDED.spawn_id END,
         x=EXCLUDED.x, y=EXCLUDED.y, z=EXCLUDED.z, yaw=EXCLUDED.yaw, updated_at=now()`,
      [player.userId, player.region.id, player.spawnId, ...player.pos, player.yaw],
    ).then(() => undefined),
  );
  pendingLocationWrites.set(player.userId, write);
  void write.finally(() => {
    if (pendingLocationWrites.get(player.userId) === write) pendingLocationWrites.delete(player.userId);
  }).catch((error) => logger.error({ error, userId: player.userId }, "player location persistence failed"));
  return write;
}

export function attachGateway(http: HttpServer) {
  const io = new Server(http, { cors: { origin: env.CORS_ORIGIN, credentials: true }, maxHttpBufferSize: 4_000 });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    const claims = token ? verifyAccess(token) : null;
    if (!claims) return next(new Error("unauthorized"));
    try {
      if (!(await isSessionActive(claims.sessionId, claims.sub))) return next(new Error("unauthorized"));
      socket.data.user = { id: claims.sub, name: claims.name, sessionId: claims.sessionId };
      next();
    } catch (error) { next(error as Error); }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string; name: string; sessionId: string };
    const previousSocketId = latestSocketByUser.get(user.id);
    latestSocketByUser.set(user.id, socket.id);
    // Enforce one active realtime connection per account, even if the old socket
    // has not joined a region yet and therefore has no entry in players.
    if (previousSocketId && previousSocketId !== socket.id) {
      const previousPlayer = players.get(previousSocketId);
      if (previousPlayer) void persistPlayerLocation(previousPlayer).catch(() => {});
      io.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }
    let sessionCheckRunning = false;
    const sessionWatch = setInterval(async () => {
      if (sessionCheckRunning || !socket.connected) return;
      sessionCheckRunning = true;
      try {
        // PostgreSQL is authoritative. A DB validation failure closes the socket (fail closed).
        if (!(await isSessionActive(user.sessionId, user.id))) {
          socket.disconnect(true);
          return;
        }
        // Redis is an additional fast revocation signal; DB remains the source of truth.
        try {
          if (await redis.get(`revoked-session:${user.sessionId}`)) socket.disconnect(true);
        } catch (error) {
          logger.warn({ error }, "redis session revocation marker unavailable; database session remains authoritative");
        }
      } catch (error) {
        logger.error({ error }, "session validation failed; disconnecting socket");
        socket.disconnect(true);
      } finally {
        sessionCheckRunning = false;
      }
    }, 5_000);

    socket.on(E.clientJoin, async (raw) => {
      if (latestSocketByUser.get(user.id) !== socket.id) return;
      const parsed = joinRegionPayload.safeParse(raw);
      const region = parsed.success ? getRegion(parsed.data.regionId) : undefined;
      if (!region) return void socket.emit(E.serverError, { code: "bad_region" });

      try {
        await pendingLocationWrites.get(user.id);
        const previous = players.get(socket.id);
        if (previous) await persistPlayerLocation(previous);

        const loc = (await pool.query(
          `SELECT region_id, spawn_id, x, y, z, yaw FROM player_locations WHERE user_id=$1`, [user.id])).rows[0];
        const spawn = region.spawns.find((s) => s.id === region.defaultSpawn)!;
        const restored = resolveSavedLocation(region, loc ? {
          regionId: loc.region_id,
          spawnId: loc.spawn_id,
          position: [loc.x, loc.y, loc.z],
          yaw: loc.yaw,
        } : null);
        const start: Vec3 = restored?.position ?? [...spawn.position];
        const startYaw = restored?.yaw ?? spawn.yaw;

        const p: Player = {
          userId: user.id, name: user.name, socketId: socket.id,
          region, spawnId: restored ? loc.spawn_id : spawn.id,
          pos: start, yaw: startYaw, anim: "idle", lastStateAt: Date.now(), lastSeq: -1,
        };
        players.set(socket.id, p);
        for (const room of socket.rooms) if (room.startsWith("region:")) socket.leave(room);
        socket.join(`region:${region.id}`);

        // Presence is an auxiliary Redis record; a Redis outage must not leave a joined
        // socket without its serverJoined acknowledgement.
        try {
          await redis.hset(`presence:${user.id}`, { region: region.id, name: user.name, at: Date.now() });
          await redis.expire(`presence:${user.id}`, 120);
        } catch (error) {
          logger.warn({ error, userId: user.id }, "presence write failed during region join");
        }

        socket.emit(E.serverJoined, { regionId: region.id, position: p.pos, yaw: p.yaw });
      } catch (error) {
        logger.error({ error, userId: user.id, regionId: region.id }, "region join failed");
        socket.emit(E.serverError, { code: "join_unavailable" });
      }
    });

    socket.on(E.clientState, async (raw) => {
      if (latestSocketByUser.get(user.id) !== socket.id) return;
      const p = players.get(socket.id);
      if (!p) return;
      const parsed = playerStatePayload.safeParse(raw);
      if (!parsed.success) return;
      const now = Date.now();
      if (now - p.lastStateAt < 40 || parsed.data.seq <= p.lastSeq) return;
      const dt = (now - p.lastStateAt) / 1000;
      const v = validateMove(p.region, p.pos, parsed.data.p, dt);
      p.lastStateAt = now;
      p.lastSeq = parsed.data.seq;
      if (!v.ok) {
        socket.emit(E.serverCorrect, { position: v.position, reason: v.reason, seq: parsed.data.seq });
        return;
      }
      p.pos = v.position; p.yaw = parsed.data.yaw; p.anim = parsed.data.anim;
    });

    socket.on(E.clientChat, async (raw) => {
      if (latestSocketByUser.get(user.id) !== socket.id) return;
      const p = players.get(socket.id);
      const parsed = chatSendPayload.safeParse(raw);
      if (!p || !parsed.success) return;
      try {
        const okBurst = await hit(`chat1:${user.id}`, 1, 1);
        const okWindow = await hit(`chat10:${user.id}`, 6, 10);
        if (!okBurst || !okWindow) return void socket.emit(E.serverError, { code: "chat_rate_limited" });
        const msg: ChatMessage = { id: randomUUID(), from: p.name, text: parsed.data.text, at: Date.now() };
        io.to(`region:${p.region.id}`).emit(E.serverChat, msg);
      } catch (error) {
        // Rate limiting is fail-closed: never broadcast chat when its limiter is unavailable.
        logger.error({ error, userId: user.id }, "chat rate limiter unavailable");
        socket.emit(E.serverError, { code: "chat_unavailable" });
      }
    });

    socket.on("disconnect", async () => {
      clearInterval(sessionWatch);
      const p = players.get(socket.id);
      players.delete(socket.id);
      // A replaced socket must never erase the newer socket's presence or checkpoint.
      if (latestSocketByUser.get(user.id) !== socket.id) return;
      latestSocketByUser.delete(user.id);
      if (!p) return;
      // Register the database write before awaiting Redis so a fast reconnect can await it.
      const save = persistPlayerLocation(p);
      await redis.del(`presence:${p.userId}`).catch(() => {});
      await save.catch(() => {});
    });
  });

  // Keep timer handles so they can be stopped when the HTTP server closes.
  const stateTick = setInterval(() => {
    const byRegion = new Map<string, Player[]>();
    for (const p of players.values()) {
      const list = byRegion.get(p.region.id) ?? [];
      list.push(p); byRegion.set(p.region.id, list);
    }
    for (const list of byRegion.values()) {
      const index = buildInterestIndex(list);
      for (const me of list) {
        const near: RemotePlayerSnapshot[] = findNearbyPlayers(me, index).map((other) => ({
          id: other.userId, name: other.name, p: other.pos, yaw: other.yaw, anim: other.anim,
        }));
        io.to(me.socketId).emit(E.serverState, near);
      }
    }
  }, 1000 / TICK_RATE_HZ);

  // Persist authoritative positions periodically so a process crash loses at most one interval.
  const persistenceTick = setInterval(() => {
    for (const player of players.values()) {
      void persistPlayerLocation(player).catch(() => {});
    }
  }, 15_000);

  const presenceRefresh = setInterval(() => {
    for (const p of players.values()) void redis.expire(`presence:${p.userId}`, 120).catch(() => {});
  }, 60_000);

  // Socket.IO closes the underlying HTTP server during graceful shutdown.
  // Clear both intervals so the gateway releases its event-loop references.
  stateTick.unref();
  presenceRefresh.unref();
  persistenceTick.unref();
  http.once("close", () => {
    clearInterval(stateTick);
    clearInterval(presenceRefresh);
    clearInterval(persistenceTick);
  });

  return io;
}
