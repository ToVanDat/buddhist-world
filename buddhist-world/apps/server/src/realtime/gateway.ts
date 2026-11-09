import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { randomUUID } from "node:crypto";
import {
  SOCKET_EVENTS as E, joinRegionPayload, playerStatePayload, chatSendPayload, worldInteractionPayload,
  getRegion, getWorldInteraction, TICK_RATE_HZ, type RegionDef, type Vec3,
  type RemotePlayerSnapshot, type ChatMessage,
} from "@bw/shared";
import { env } from "../config/env.js";
import { verifyAccess } from "../lib/tokens.js";
import { isSessionActive } from "../lib/sessions.js";
import { pool } from "../db/pool.js";
import { redis } from "../lib/redis.js";
import { hit } from "../lib/rateLimit.js";
import { logger } from "../lib/logger.js";
import { distance2D, normalizeYaw, resolveSavedLocation, validateMove } from "./movement.js";
import { buildInterestIndex, findNearbyPlayers } from "./interest.js";
import { recordWorldInteractionProgress } from "../modules/world/progress.js";

interface Player {
  userId: string; name: string; socketId: string;
  region: RegionDef; spawnId: string; pos: Vec3; yaw: number; anim: RemotePlayerSnapshot["anim"];
  lastStateAt: number; lastSeq: number; lastPresenceAt: number;
}

/** Trạng thái authoritative của một instance. Redis presence hỗ trợ quan sát; chưa phải adapter đa instance. */
const players = new Map<string, Player>();
const latestSocketByUser = new Map<string, string>();
const pendingLocationWrites = new Map<string, Promise<void>>();

function persistPlayerLocation(player: Player): Promise<void> {
  const previousWrite = pendingLocationWrites.get(player.userId);
  const write = (previousWrite?.catch(() => {}) ?? Promise.resolve()).then(() =>
    pool.query(
      `INSERT INTO player_locations (user_id, region_id, spawn_id, x, y, z, yaw)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET region_id=EXCLUDED.region_id,
         spawn_id=CASE WHEN player_locations.region_id=EXCLUDED.region_id THEN player_locations.spawn_id ELSE EXCLUDED.spawn_id END,
         x=EXCLUDED.x, y=EXCLUDED.y, z=EXCLUDED.z, yaw=EXCLUDED.yaw, updated_at=now()`,
      [player.userId, player.region.id, player.spawnId, ...player.pos, normalizeYaw(player.yaw)],
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
    if (previousSocketId && previousSocketId !== socket.id) {
      const previousPlayer = players.get(previousSocketId);
      if (previousPlayer) void persistPlayerLocation(previousPlayer);
      io.sockets.sockets.get(previousSocketId)?.disconnect(true);
    }
    let sessionCheckRunning = false;
    const sessionWatch = setInterval(async () => {
      if (sessionCheckRunning || !socket.connected) return;
      sessionCheckRunning = true;
      try {
        if (!(await isSessionActive(user.sessionId, user.id))) {
          socket.disconnect(true);
          return;
        }
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
          regionId: loc.region_id, spawnId: loc.spawn_id,
          position: [loc.x, loc.y, loc.z], yaw: loc.yaw,
        } : null);
        const start: Vec3 = restored?.position ?? [...spawn.position];
        const startYaw = normalizeYaw(restored?.yaw ?? spawn.yaw, spawn.yaw);
        const p: Player = {
          userId: user.id, name: user.name, socketId: socket.id,
          region, spawnId: restored ? loc.spawn_id : spawn.id,
          pos: start, yaw: startYaw, anim: "idle", lastStateAt: Date.now(), lastSeq: -1, lastPresenceAt: 0,
        };
        players.set(socket.id, p);
        for (const room of socket.rooms) if (room.startsWith("region:")) socket.leave(room);
        socket.join(`region:${region.id}`);
        try {
          await redis.hset(`presence:${user.id}`, { region: region.id, name: user.name, x: p.pos[0], y: p.pos[1], z: p.pos[2], at: Date.now() });
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
      p.pos = v.position;
      p.yaw = normalizeYaw(parsed.data.yaw, p.yaw);
      p.anim = parsed.data.anim;
      if (now - p.lastPresenceAt >= 1_000) {
        p.lastPresenceAt = now;
        void redis.hset(`presence:${user.id}`, {
          region: p.region.id, name: p.name, x: p.pos[0], y: p.pos[1], z: p.pos[2], at: now,
        }).catch((error) => logger.warn({ error, userId: user.id }, "live position presence update failed"));
      }
    });

    socket.on(E.clientInteract, async (raw) => {
      if (latestSocketByUser.get(user.id) !== socket.id) return;
      const player = players.get(socket.id);
      const parsed = worldInteractionPayload.safeParse(raw);
      if (!player || !parsed.success) return;

      const target = getWorldInteraction(parsed.data.targetId);
      if (!target || target.regionId !== player.region.id) {
        socket.emit(E.serverError, { code: "interaction_unavailable" });
        return;
      }
      const horizontalDistance = distance2D(player.pos, target.position);
      const verticalDistance = Math.abs(player.pos[1] - target.position[1]);
      if (horizontalDistance > target.radius || verticalDistance > 3.5) {
        socket.emit(E.serverError, { code: "interaction_too_far" });
        return;
      }

      try {
        // Redis NX makes per-player cooldown consistent across server instances.
        const allowed = await hit(`world-interact-rate:${user.id}`, 8, 10);
        if (!allowed) {
          socket.emit(E.serverError, { code: "interaction_rate_limited" });
          return;
        }
        const cooldownKey = `world-interact-cd:${user.id}:${target.id}`;
        const acquired = await redis.set(cooldownKey, "1", "EX", Math.ceil(target.cooldownMs / 1000), "NX");
        if (acquired !== "OK") {
          socket.emit(E.serverError, { code: "interaction_cooldown", targetId: target.id });
          return;
        }

        let questUpdates: Awaited<ReturnType<typeof recordWorldInteractionProgress>> = [];
        try {
          questUpdates = await recordWorldInteractionProgress(user.id, target.id);
        } catch (error) {
          // Keep world interactions available before migration 002 is applied.
          logger.warn({ error, userId: user.id, targetId: target.id }, "quest progress unavailable; apply world content migration");
        }
        let questOffers: { id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }[] = [];
        if (target.kind === "npc") {
          try {
            const offers = await pool.query<{ id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }>(
              `SELECT q.id, q.title, q.description, q.rewards
                 FROM world_quests q
                 LEFT JOIN player_quests pq ON pq.quest_id = q.id AND pq.user_id = $1
                WHERE q.npc_id = $2 AND q.is_active = true
                  AND (pq.status IS NULL OR pq.status = 'abandoned' OR (pq.status = 'completed' AND q.is_repeatable = true))
                ORDER BY q.created_at, q.id`,
              [user.id, target.id],
            );
            questOffers = offers.rows;
          } catch (error) {
            logger.warn({ error, userId: user.id, npcId: target.id }, "NPC quest offers unavailable; apply world content migration");
          }
        }
        try {
          await pool.query(
            `INSERT INTO world_events (region_id, actor_user_id, actor_name, target_id, interaction_kind)
             VALUES ($1, $2, $3, $4, $5)`,
            [player.region.id, user.id, player.name, target.id, target.kind],
          );
        } catch (error) {
          // Event history is additive; interactions remain available until migration 003 is applied.
          logger.warn({ error, userId: user.id, targetId: target.id }, "world event history unavailable; apply migration 003_world_events.sql");
        }
        socket.emit(E.serverInteractResult, {
          targetId: target.id,
          questUpdates,
          questOffers,
          kind: target.kind,
          name: target.name,
          response: target.response,
          at: Date.now(),
        });
        io.to(`region:${player.region.id}`).emit(E.serverWorldEvent, {
          targetId: target.id,
          actorId: user.id,
          actorName: player.name,
          kind: target.kind,
          at: Date.now(),
        });
      } catch (error) {
        logger.error({ error, userId: user.id, targetId: target.id }, "world interaction failed");
        socket.emit(E.serverError, { code: "interaction_unavailable" });
      }
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
        logger.error({ error, userId: user.id }, "chat rate limiter unavailable");
        socket.emit(E.serverError, { code: "chat_unavailable" });
      }
    });

    socket.on("disconnect", async () => {
      clearInterval(sessionWatch);
      const p = players.get(socket.id);
      players.delete(socket.id);
      if (latestSocketByUser.get(user.id) !== socket.id) return;
      latestSocketByUser.delete(user.id);
      if (!p) return;
      const save = persistPlayerLocation(p);
      await redis.del(`presence:${p.userId}`).catch(() => {});
      await save.catch(() => {});
    });
  });

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
  const persistenceTick = setInterval(() => {
    for (const player of players.values()) void persistPlayerLocation(player).catch(() => {});
  }, 15_000);
  const presenceRefresh = setInterval(() => {
    for (const p of players.values()) void redis.expire(`presence:${p.userId}`, 120).catch(() => {});
  }, 60_000);
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
