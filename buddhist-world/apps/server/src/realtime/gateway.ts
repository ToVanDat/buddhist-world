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
  region: RegionDef; pos: Vec3; yaw: number; anim: RemotePlayerSnapshot["anim"];
  lastStateAt: number; lastSeq: number;
}

/** Trạng thái authoritative của một instance. Redis presence hỗ trợ quan sát; chưa phải adapter đa instance. */
const players = new Map<string, Player>();

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

    for (const p of players.values()) {
      if (p.userId === user.id) io.sockets.sockets.get(p.socketId)?.disconnect(true);
    }

    socket.on(E.clientJoin, async (raw) => {
      const parsed = joinRegionPayload.safeParse(raw);
      const region = parsed.success ? getRegion(parsed.data.regionId) : undefined;
      if (!region) return void socket.emit(E.serverError, { code: "bad_region" });

      const loc = (await pool.query(
        `SELECT region_id, spawn_id, x, y, z FROM player_locations WHERE user_id=$1`, [user.id])).rows[0];
      const spawn = region.spawns.find((s) => s.id === region.defaultSpawn)!;
      const restored = resolveSavedLocation(region, loc ? {
        regionId: loc.region_id,
        spawnId: loc.spawn_id,
        position: [loc.x, loc.y, loc.z],
      } : null);
      const start: Vec3 = restored?.position ?? [...spawn.position];
      const startYaw = restored?.yaw ?? spawn.yaw;

      const p: Player = {
        userId: user.id, name: user.name, socketId: socket.id,
        region, pos: start, yaw: startYaw, anim: "idle", lastStateAt: Date.now(), lastSeq: -1,
      };
      players.set(socket.id, p);
      for (const room of socket.rooms) if (room.startsWith("region:")) socket.leave(room);
      socket.join(`region:${region.id}`);
      await redis.hset(`presence:${user.id}`, { region: region.id, name: user.name, at: Date.now() });
      await redis.expire(`presence:${user.id}`, 120);
      socket.emit(E.serverJoined, { regionId: region.id, position: p.pos, yaw: p.yaw });
    });

    socket.on(E.clientState, async (raw) => {
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
      const p = players.get(socket.id);
      const parsed = chatSendPayload.safeParse(raw);
      if (!p || !parsed.success) return;
      const okBurst = await hit(`chat1:${user.id}`, 1, 1);
      const okWindow = await hit(`chat10:${user.id}`, 6, 10);
      if (!okBurst || !okWindow) return void socket.emit(E.serverError, { code: "chat_rate_limited" });
      const msg: ChatMessage = { id: randomUUID(), from: p.name, text: parsed.data.text, at: Date.now() };
      io.to(`region:${p.region.id}`).emit(E.serverChat, msg);
    });

    socket.on("disconnect", async () => {
      clearInterval(sessionWatch);
      const p = players.get(socket.id);
      players.delete(socket.id);
      if (!p) return;
      const hasReplacement = [...players.values()].some((active) => active.userId === p.userId);
      if (hasReplacement) return;
      await redis.del(`presence:${p.userId}`).catch(() => {});
      await pool.query(
        `UPDATE player_locations SET region_id=$2, x=$3, y=$4, z=$5, updated_at=now() WHERE user_id=$1`,
        [p.userId, p.region.id, ...p.pos]).catch((e) => logger.error({ e }, "save location failed"));
    });
  });

  setInterval(() => {
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

  setInterval(() => {
    for (const p of players.values()) void redis.expire(`presence:${p.userId}`, 120).catch(() => {});
  }, 60_000);

  return io;
}
