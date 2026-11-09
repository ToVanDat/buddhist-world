import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
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

const PRESENCE_WRITE_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("HSET", KEYS[2], "region", ARGV[2], "name", ARGV[3], "x", ARGV[4], "y", ARGV[5], "z", ARGV[6], "yaw", ARGV[7], "anim", ARGV[8], "socketId", ARGV[9], "at", ARGV[10], "heartbeatAt", ARGV[10], "ownerToken", ARGV[1])
redis.call("PEXPIRE", KEYS[2], 30000)
redis.call("SADD", KEYS[3], ARGV[11])
if KEYS[4] ~= KEYS[3] then redis.call("SREM", KEYS[4], ARGV[11]) end
return 1
`;
const OWNER_HEARTBEAT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("PEXPIRE", KEYS[1], 30000)
redis.call("HSET", KEYS[2], "heartbeatAt", ARGV[2])
redis.call("PEXPIRE", KEYS[2], 30000)
return 1
`;
const OWNER_CLEANUP_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("DEL", KEYS[1], KEYS[2])
redis.call("SREM", KEYS[3], ARGV[2])
return 1
`;
export async function attachGateway(http: HttpServer) {
  /** Per-gateway movement state; shared state lives in Redis. */
  const players = new Map<string, Player>();
  const pendingLocationWrites = new Map<string, Promise<void>>();
  
  function persistPlayerLocation(player: Player): Promise<void> {
    const previousWrite = pendingLocationWrites.get(player.userId);
    const write = (previousWrite?.catch(() => {}) ?? Promise.resolve()).then(() =>
      pool.query(
        `INSERT INTO player_locations (user_id, region_id, spawn_id, x, y, z, yaw, updated_at, state_updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8::double precision / 1000),to_timestamp($8::double precision / 1000))
         ON CONFLICT (user_id) DO UPDATE SET region_id=EXCLUDED.region_id,
           spawn_id=CASE WHEN player_locations.region_id=EXCLUDED.region_id THEN player_locations.spawn_id ELSE EXCLUDED.spawn_id END,
           x=EXCLUDED.x, y=EXCLUDED.y, z=EXCLUDED.z, yaw=EXCLUDED.yaw,
           updated_at=GREATEST(player_locations.updated_at, EXCLUDED.updated_at),
           state_updated_at=EXCLUDED.state_updated_at
         WHERE player_locations.state_updated_at <= EXCLUDED.state_updated_at`,
        [player.userId, player.region.id, player.spawnId, ...player.pos, normalizeYaw(player.yaw), player.lastStateAt],
      ).then(() => undefined),
    );
    pendingLocationWrites.set(player.userId, write);
    void write.finally(() => {
      if (pendingLocationWrites.get(player.userId) === write) pendingLocationWrites.delete(player.userId);
    }).catch((error) => logger.error({ error, userId: player.userId }, "player location persistence failed"));
    return write;
  }

  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  try {
    await Promise.all([pubClient.ping(), subClient.ping()]);
  } catch (error) {
    await Promise.allSettled([pubClient.quit(), subClient.quit()]);
    throw error;
  }

  const io = new Server(http, { cors: { origin: env.CORS_ORIGIN, credentials: true }, maxHttpBufferSize: 4_000 });
  io.adapter(createAdapter(pubClient, subClient));
  io.on("bw:replace-socket", (userId: string, replacementToken: string) => {
    for (const connected of io.sockets.sockets.values()) {
      const connectedUser = connected.data.user as { id?: string } | undefined;
      if (connectedUser?.id === userId && connected.data.ownerToken !== replacementToken) connected.disconnect(true);
    }
  });
  io.use(async (socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    const claims = token ? verifyAccess(token) : null;
    if (!claims) return next(new Error("unauthorized"));
    try {
      if (!(await isSessionActive(claims.sessionId, claims.sub))) return next(new Error("unauthorized"));
      const user = { id: claims.sub, name: claims.name, sessionId: claims.sessionId };
      const ownerToken = randomUUID();
      const ownerKey = `socket-owner:${user.id}`;
      const previousPresence = await redis.hgetall(`presence:${user.id}`);
      await redis.set(ownerKey, ownerToken, "PX", 30_000);
      if ((await redis.get(ownerKey)) !== ownerToken) return next(new Error("realtime_ownership_conflict"));
      socket.data.user = user;
      socket.data.ownerToken = ownerToken;
      socket.data.previousPresence = previousPresence;
      io.serverSideEmit("bw:replace-socket", user.id, ownerToken);
      for (const connected of io.sockets.sockets.values()) {
        const connectedUser = connected.data.user as { id?: string } | undefined;
        if (connectedUser?.id === user.id) connected.disconnect(true);
      }
      next();
    } catch (error) { next(error as Error); }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string; name: string; sessionId: string };
    const ownerToken = socket.data.ownerToken as string;
    const ownerKey = `socket-owner:${user.id}`;
    const presenceKey = `presence:${user.id}`;
    const previousPresence = socket.data.previousPresence as Record<string, string>;
    const ownershipReady = true;
    const ownsSocket = async () => {
      if (!ownershipReady || !socket.connected) return false;
      try { return (await redis.get(ownerKey)) === ownerToken; }
      catch (error) {
        logger.error({ error, userId: user.id }, "socket ownership check failed");
        socket.disconnect(true);
        return false;
      }
    };
    const ownershipHeartbeat = setInterval(async () => {
      try {
        const result = await redis.eval(OWNER_HEARTBEAT_SCRIPT, 2, ownerKey, presenceKey, ownerToken, String(Date.now()));
        if (Number(result) !== 1) socket.disconnect(true);
      } catch (error) {
        logger.error({ error, userId: user.id }, "distributed socket ownership heartbeat failed");
        socket.disconnect(true);
      }
    }, 10_000);
    ownershipHeartbeat.unref();
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
      if (!(await ownsSocket())) return;
      const parsed = joinRegionPayload.safeParse(raw);
      const region = parsed.success ? getRegion(parsed.data.regionId) : undefined;
      if (!region) return void socket.emit(E.serverError, { code: "bad_region" });
      try {
        await pendingLocationWrites.get(user.id);
        const previous = players.get(socket.id);
        if (previous) await redis.srem(`presence-region:${previous.region.id}`, user.id);
        const loc = (await pool.query(
          `SELECT region_id, spawn_id, x, y, z, yaw FROM player_locations WHERE user_id=$1`, [user.id])).rows[0];
        const spawn = region.spawns.find((s) => s.id === region.defaultSpawn)!;
        const presenceFresh = previousPresence.region === region.id
          && Number.isFinite(Number(previousPresence.heartbeatAt))
          && Date.now() - Number(previousPresence.heartbeatAt) < 30_000;
        const livePosition = [Number(previousPresence.x), Number(previousPresence.y), Number(previousPresence.z)];
        const liveSnapshot = presenceFresh && livePosition.every(Number.isFinite)
          ? { regionId: region.id, spawnId: loc?.spawn_id ?? region.defaultSpawn, position: livePosition, yaw: Number(previousPresence.yaw) }
          : null;
        const restored = resolveSavedLocation(region, liveSnapshot ?? (loc ? {
          regionId: loc.region_id, spawnId: loc.spawn_id,
          position: [loc.x, loc.y, loc.z], yaw: loc.yaw,
        } : null));
        const start: Vec3 = restored?.position ?? [...spawn.position];
        const startYaw = normalizeYaw(restored?.yaw ?? spawn.yaw, spawn.yaw);
        const p: Player = {
          userId: user.id, name: user.name, socketId: socket.id,
          region, spawnId: restored ? (loc?.spawn_id ?? region.defaultSpawn) : spawn.id,
          pos: start, yaw: startYaw, anim: "idle", lastStateAt: Date.now(), lastSeq: -1, lastPresenceAt: 0,
        };
        players.set(socket.id, p);
        for (const room of socket.rooms) if (room.startsWith("region:")) socket.leave(room);
        socket.join(`region:${region.id}`);
        const presenceWritten = await redis.eval(
          PRESENCE_WRITE_SCRIPT, 4, ownerKey, presenceKey,
          `presence-region:${region.id}`, `presence-region:${previous?.region.id ?? region.id}`,
          ownerToken, region.id, user.name, String(p.pos[0]), String(p.pos[1]), String(p.pos[2]),
          String(p.yaw), p.anim, socket.id, String(Date.now()), user.id,
        );
        if (Number(presenceWritten) !== 1) {
          players.delete(socket.id);
          socket.disconnect(true);
          return;
        }
        socket.emit(E.serverJoined, { regionId: region.id, position: p.pos, yaw: p.yaw });
        void persistPlayerLocation(p).catch((error) => logger.warn({ error, userId: user.id }, "initial handoff location persistence failed"));
      } catch (error) {
        logger.error({ error, userId: user.id, regionId: region.id }, "region join failed");
        socket.emit(E.serverError, { code: "join_unavailable" });
      }
    });

    socket.on(E.clientState, async (raw) => {
      if (!(await ownsSocket())) return;
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
      if (now - p.lastPresenceAt >= 100) {
        p.lastPresenceAt = now;
        void redis.eval(
          PRESENCE_WRITE_SCRIPT, 4, ownerKey, presenceKey,
          `presence-region:${p.region.id}`, `presence-region:${p.region.id}`,
          ownerToken, p.region.id, p.name, String(p.pos[0]), String(p.pos[1]), String(p.pos[2]),
          String(p.yaw), p.anim, socket.id, String(now), user.id,
        ).then((written) => {
          if (Number(written) !== 1) socket.disconnect(true);
        }).catch((error) => logger.warn({ error, userId: user.id }, "distributed player state write failed"));
      }
    });

    socket.on(E.clientInteract, async (raw) => {
      if (!(await ownsSocket())) return;
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
      if (!(await ownsSocket())) return;
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
      clearInterval(ownershipHeartbeat);
      const cleaned = await redis.eval(
        OWNER_CLEANUP_SCRIPT, 3, ownerKey, presenceKey,
        `presence-region:${p?.region.id ?? "__none__"}`, ownerToken, user.id,
      ).catch((error) => {
        logger.warn({ error, userId: user.id }, "distributed socket cleanup failed");
        return 0;
      });
      if (Number(cleaned) !== 1) return;
      if (p) await persistPlayerLocation(p).catch(() => {});
    });
  });

  let stateTickRunning = false;
  const stateTick = setInterval(async () => {
    if (stateTickRunning) return;
    stateTickRunning = true;
    try {
      const byRegion = new Map<string, Player[]>();
      for (const p of players.values()) {
        const list = byRegion.get(p.region.id) ?? [];
        list.push(p); byRegion.set(p.region.id, list);
      }
      for (const [regionId, localPlayers] of byRegion) {
        const memberIds = await redis.smembers(`presence-region:${regionId}`);
        const pipeline = redis.pipeline();
        for (const userId of memberIds) pipeline.hgetall(`presence:${userId}`);
        const results = await pipeline.exec();
        const distributed: Array<{ userId: string; name: string; pos: Vec3; yaw: number; anim: RemotePlayerSnapshot["anim"] }> = [];
        const staleIds: string[] = [];
        for (let i = 0; i < memberIds.length; i += 1) {
          const [error, raw] = results?.[i] ?? [new Error("missing presence result"), null];
          const data = raw as Record<string, string> | null;
          if (error || !data || data.region !== regionId || !Number.isFinite(Number(data.heartbeatAt)) || Date.now() - Number(data.heartbeatAt) > 30_000) {
            staleIds.push(memberIds[i]!); continue;
          }
          const pos = [Number(data.x), Number(data.y), Number(data.z)];
          if (!pos.every(Number.isFinite) || !Number.isFinite(Number(data.yaw))) {
            staleIds.push(memberIds[i]!); continue;
          }
          const anim = (["idle", "walk", "run", "jump"] as const).includes(data.anim as RemotePlayerSnapshot["anim"])
            ? data.anim as RemotePlayerSnapshot["anim"] : "idle";
          distributed.push({ userId: memberIds[i]!, name: data.name || "Player",
            pos: [pos[0]!, pos[1]!, pos[2]!], yaw: normalizeYaw(Number(data.yaw)), anim });
        }
        if (staleIds.length) void redis.srem(`presence-region:${regionId}`, ...staleIds).catch(() => {});
        const index = buildInterestIndex(distributed);
        const distributedByUser = new Map(distributed.map((player) => [player.userId, player]));
        for (const me of localPlayers) {
          const mePresence = distributedByUser.get(me.userId);
          const near: RemotePlayerSnapshot[] = mePresence
            ? findNearbyPlayers(mePresence, index)
              .filter((other) => other.userId !== me.userId)
              .map((other) => ({ id: other.userId, name: other.name, p: other.pos, yaw: other.yaw, anim: other.anim }))
            : [];
          io.to(me.socketId).emit(E.serverState, near);
        }
      }
    } catch (error) {
      logger.warn({ error }, "distributed player snapshot tick failed");
      for (const p of players.values()) {
        const local = [...players.values()].filter((other) => other.region.id === p.region.id && other.userId !== p.userId);
        io.to(p.socketId).emit(E.serverState, local.map((other) => ({
          id: other.userId, name: other.name, p: other.pos, yaw: other.yaw, anim: other.anim,
        })));
      }
    } finally { stateTickRunning = false; }
  }, 1000 / TICK_RATE_HZ);
  const persistenceTick = setInterval(async () => {
    for (const player of players.values()) {
      try {
        const owner = await redis.get(`socket-owner:${player.userId}`);
        if (owner === (io.sockets.sockets.get(player.socketId)?.data.ownerToken as string | undefined)) {
          await persistPlayerLocation(player);
        }
      } catch (error) {
        logger.warn({ error, userId: player.userId }, "distributed ownership check before location persistence failed");
      }
    }
  }, 15_000);
  // Per-socket owner heartbeats refresh presence TTL and expire stale ownership after crashes.
  stateTick.unref();
  persistenceTick.unref();
  http.once("close", () => {
    clearInterval(stateTick);
    clearInterval(persistenceTick);
    void Promise.allSettled([pubClient.quit(), subClient.quit()]);
  });
  return io;
}
