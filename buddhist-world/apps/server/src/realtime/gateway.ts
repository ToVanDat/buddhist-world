import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { randomUUID } from "node:crypto";
import {
  SOCKET_EVENTS as E, joinRegionPayload, playerStatePayload, chatSendPayload, worldInteractionPayload, voiceSignalPayload, voiceActivityPayload,
  getRegion, getWorldInteraction, TICK_RATE_HZ, VOICE_RADIUS_M, MAX_VOICE_PEERS, type RegionDef, type Vec3,
  type RemotePlayerSnapshot, type ChatMessage, type NpcRegionSnapshot,
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
import { recordWorldInteractionProgress, QuestRewardInventoryFullError, QuestRewardConfigurationError } from "../modules/world/progress.js";
import { recordWorldAchievements } from "../modules/world/achievements.js";
import { buildNpcRegionSnapshots, type NpcScheduleRow } from "../modules/world/npcSnapshots.js";
import { getWorldClockMinute } from "../modules/world/worldClock.js";
import { getNpcDialogueNode, validateNpcDialogueGraph } from "../modules/world/dialogueGraph.js";

interface Player {
  userId: string; name: string; socketId: string;
  region: RegionDef; spawnId: string; pos: Vec3; yaw: number; anim: RemotePlayerSnapshot["anim"];
  lastStateAt: number; lastSeq: number; lastPresenceAt: number; ownerEpoch: number;
}

const OWNER_ACQUIRE_SCRIPT = `
local epoch = redis.call("INCR", KEYS[2])
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
return epoch
`;
const PRESENCE_WRITE_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("HSET", KEYS[2], "region", ARGV[2], "name", ARGV[3], "x", ARGV[4], "y", ARGV[5], "z", ARGV[6], "yaw", ARGV[7], "anim", ARGV[8], "socketId", ARGV[9], "at", ARGV[10], "heartbeatAt", ARGV[10], "ownerToken", ARGV[1])
redis.call("PEXPIRE", KEYS[2], ARGV[12])
redis.call("SADD", KEYS[3], ARGV[11])
if KEYS[4] ~= KEYS[3] then redis.call("SREM", KEYS[4], ARGV[11]) end
return 1
`;
const OWNER_HEARTBEAT_SCRIPT = `
if redis.call("GET", KEYS[1]) ~= ARGV[1] then return 0 end
redis.call("PEXPIRE", KEYS[1], ARGV[3])
redis.call("HSET", KEYS[2], "heartbeatAt", ARGV[2])
redis.call("PEXPIRE", KEYS[2], ARGV[3])
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
  const npcPositionById = new Map<string, { regionId: string; position: Vec3 }>();
  const scheduledNpcIds = new Set<string>();
  const npcSnapshotByRegion = new Map<string, NpcRegionSnapshot>();
  
  function persistPlayerLocation(player: Player): Promise<void> {
    const previousWrite = pendingLocationWrites.get(player.userId);
    const write = (previousWrite?.catch(() => {}) ?? Promise.resolve()).then(() =>
      pool.query(
        `INSERT INTO player_locations (user_id, region_id, spawn_id, x, y, z, yaw, updated_at, state_updated_at, owner_epoch)
         VALUES ($1,$2,$3,$4,$5,$6,$7,to_timestamp($8::double precision / 1000),to_timestamp($8::double precision / 1000),$9)
         ON CONFLICT (user_id) DO UPDATE SET region_id=EXCLUDED.region_id,
           spawn_id=CASE WHEN player_locations.region_id=EXCLUDED.region_id THEN player_locations.spawn_id ELSE EXCLUDED.spawn_id END,
           x=EXCLUDED.x, y=EXCLUDED.y, z=EXCLUDED.z, yaw=EXCLUDED.yaw,
           updated_at=GREATEST(player_locations.updated_at, EXCLUDED.updated_at),
           state_updated_at=EXCLUDED.state_updated_at,
           owner_epoch=EXCLUDED.owner_epoch
         WHERE player_locations.owner_epoch < EXCLUDED.owner_epoch
            OR (player_locations.owner_epoch = EXCLUDED.owner_epoch
                AND player_locations.state_updated_at <= EXCLUDED.state_updated_at)`,
        [player.userId, player.region.id, player.spawnId, ...player.pos, normalizeYaw(player.yaw), player.lastStateAt, player.ownerEpoch],
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
  io.on("bw:replace-socket", async (userId: string, replacementToken: string) => {
    // Concurrent logins can publish replacement events out of order. Only the
    // token that currently owns the Redis lease may evict another socket.
    try {
      if ((await redis.get(`socket-owner:${userId}`)) !== replacementToken) return;
      for (const connected of io.sockets.sockets.values()) {
        const connectedUser = connected.data.user as { id?: string } | undefined;
        if (connectedUser?.id === userId && connected.data.ownerToken !== replacementToken) connected.disconnect(true);
      }
    } catch (error) {
      logger.error({ error, userId }, "socket replacement check failed");
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
      const ownerEpoch = Number(await redis.eval(
        OWNER_ACQUIRE_SCRIPT, 2, ownerKey, `socket-owner-epoch:${user.id}`, ownerToken, String(env.SOCKET_OWNER_LEASE_MS),
      ));
      if (!Number.isSafeInteger(ownerEpoch) || ownerEpoch < 1) return next(new Error("realtime_ownership_conflict"));
      const previousPresence = await redis.hgetall(`presence:${user.id}`);
      socket.data.user = user;
      socket.data.ownerToken = ownerToken;
      socket.data.ownerEpoch = ownerEpoch;
      socket.data.previousPresence = previousPresence;
      if ((await redis.get(ownerKey)) !== ownerToken) return next(new Error("realtime_ownership_replaced"));
      io.serverSideEmit("bw:replace-socket", user.id, ownerToken);
      // Re-check after publishing; a simultaneous login may have taken the lease.
      if ((await redis.get(ownerKey)) === ownerToken) {
        for (const connected of io.sockets.sockets.values()) {
          const connectedUser = connected.data.user as { id?: string } | undefined;
          if (connectedUser?.id === user.id && connected.data.ownerToken !== ownerToken) connected.disconnect(true);
        }
      }
      next();
    } catch (error) { next(error as Error); }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user as { id: string; name: string; sessionId: string };
    const ownerToken = socket.data.ownerToken as string;
    const ownerEpoch = socket.data.ownerEpoch as number;
    const ownerKey = `socket-owner:${user.id}`;
    const presenceKey = `presence:${user.id}`;
    socket.join(`player:${user.id}`);
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
    // A replacement event can race the connection callback across processes.
    // Revalidate here so a socket whose lease was already superseded never joins.
    void ownsSocket().then((owned) => { if (!owned) socket.disconnect(true); });
    const ownershipHeartbeat = setInterval(async () => {
      try {
        const result = await redis.eval(OWNER_HEARTBEAT_SCRIPT, 2, ownerKey, presenceKey, ownerToken, String(Date.now()), String(env.SOCKET_OWNER_LEASE_MS));
        if (Number(result) !== 1) socket.disconnect(true);
      } catch (error) {
        logger.error({ error, userId: user.id }, "distributed socket ownership heartbeat failed");
        socket.disconnect(true);
      }
    }, Math.max(250, Math.floor(env.SOCKET_OWNER_LEASE_MS / 3)));
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
        if (previous && previous.region.id !== region.id) {
          io.to(`region:${previous.region.id}`).emit(E.serverVoiceActivity, { userId: user.id, active: false, at: Date.now() });
        }
        // The Lua presence write removes the previous region membership only
        // after verifying this socket still owns the lease.
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
          pos: start, yaw: startYaw, anim: "idle", lastStateAt: Date.now(), lastSeq: -1, lastPresenceAt: 0, ownerEpoch,
        };
        players.set(socket.id, p);
        for (const room of socket.rooms) if (room.startsWith("region:")) socket.leave(room);
        socket.join(`region:${region.id}`);
        const presenceWritten = await redis.eval(
          PRESENCE_WRITE_SCRIPT, 4, ownerKey, presenceKey,
          `presence-region:${region.id}`, `presence-region:${previous?.region.id ?? region.id}`,
          ownerToken, region.id, user.name, String(p.pos[0]), String(p.pos[1]), String(p.pos[2]),
          String(p.yaw), p.anim, socket.id, String(Date.now()), user.id, String(env.SOCKET_OWNER_LEASE_MS),
        );
        if (Number(presenceWritten) !== 1) {
          players.delete(socket.id);
          socket.disconnect(true);
          return;
        }
        socket.emit(E.serverJoined, { regionId: region.id, position: p.pos, yaw: p.yaw });
        const npcSnapshot = npcSnapshotByRegion.get(region.id);
        if (npcSnapshot) socket.emit(E.serverNpcState, npcSnapshot);
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
          String(p.yaw), p.anim, socket.id, String(now), user.id, String(env.SOCKET_OWNER_LEASE_MS),
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
      if (!target || target.regionId !== player.region.id ||
          (target.kind === "npc" && scheduledNpcIds.has(target.id) && !npcPositionById.has(target.id))) {
        socket.emit(E.serverError, { code: "interaction_unavailable" });
        return;
      }
      const interactionPosition = target.kind === "npc"
        ? npcPositionById.get(target.id)?.position ?? target.position
        : target.position;
      const horizontalDistance = distance2D(player.pos, interactionPosition);
      const verticalDistance = Math.abs(player.pos[1] - interactionPosition[1]);
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
          if (error instanceof QuestRewardInventoryFullError) {
            socket.emit(E.serverError, { code: error.code, itemId: error.itemId });
          } else if (error instanceof QuestRewardConfigurationError) {
            logger.error({ error, userId: user.id, targetId: target.id }, "quest reward configuration is invalid");
            socket.emit(E.serverError, { code: error.code });
          } else {
            // Keep world interactions available before migration 002 is applied.
            logger.warn({ error, userId: user.id, targetId: target.id }, "quest progress unavailable; verify world content schema");
          }
        }
        let dialogue: { id: string; text: string }[] = [];
        let dialogueChoices: { id: string; label: string }[] = [];
        let dialogueNodeId: string | undefined;
        let dialogueNpcId: string | undefined;
        let questOffers: { id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }[] = [];
        if (target.kind === "npc") {
          try {
            const npc = await pool.query<{ dialogue: unknown; dialogue_graph: unknown }>(
              "SELECT dialogue, to_jsonb(world_npcs)->'dialogue_graph' AS dialogue_graph FROM world_npcs WHERE id = $1 AND region_id = $2 AND is_active = true",
              [target.id, player.region.id],
            );
            const graphValue = npc.rows[0]?.dialogue_graph;
            if (graphValue && typeof graphValue === "object" && Object.keys(graphValue as object).length > 0) {
              const graph = validateNpcDialogueGraph(graphValue);
              const saved = await pool.query<{ current_node_id: string; unlocked_quest_ids: string[] }>(
                "SELECT current_node_id, unlocked_quest_ids FROM player_npc_dialogue_state WHERE user_id = $1 AND npc_id = $2",
                [user.id, target.id],
              );
              const node = getNpcDialogueNode(graph, saved.rows[0]?.current_node_id ?? graph.startNodeId);
              if (node) {
                dialogue = [{ id: node.id, text: node.text }];
                dialogueChoices = node.choices.map((choice) => ({ id: choice.id, label: choice.label }));
                dialogueNodeId = node.id;
                dialogueNpcId = target.id;
              }
              const unlockedQuestIds = saved.rows[0]?.unlocked_quest_ids ?? [];
              if (unlockedQuestIds.length) {
                const offers = await pool.query(
                  "SELECT q.id, q.title, q.description, q.rewards FROM world_quests q LEFT JOIN player_quests pq ON pq.quest_id = q.id AND pq.user_id = $1 WHERE q.npc_id = $2 AND q.id = ANY($3::text[]) AND q.is_active = true AND (pq.status IS NULL OR pq.status = 'abandoned' OR (pq.status = 'completed' AND q.is_repeatable = true)) ORDER BY q.created_at, q.id",
                  [user.id, target.id, unlockedQuestIds],
                );
                questOffers = offers.rows;
              }
            } else {
              const rawDialogue = npc.rows[0]?.dialogue;
              if (Array.isArray(rawDialogue)) {
                dialogue = rawDialogue.flatMap((entry) => {
                  if (!entry || typeof entry !== "object") return [];
                  const line = entry as Record<string, unknown>;
                  return typeof line.id === "string" && typeof line.text === "string"
                    ? [{ id: line.id.slice(0, 64), text: line.text.slice(0, 1200) }]
                    : [];
                }).slice(0, 12);
              }
            }
          } catch (error) {
            logger.warn({ error, userId: user.id, npcId: target.id }, "NPC dialogue unavailable; using built-in fallback");
          }
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
        let achievementsUnlocked: Awaited<ReturnType<typeof recordWorldAchievements>> = [];
        let worldEventRecorded = false;
        try {
          await pool.query(
            `INSERT INTO world_events (region_id, actor_user_id, actor_name, target_id, interaction_kind)
             VALUES ($1, $2, $3, $4, $5)`,
            [player.region.id, user.id, player.name, target.id, target.kind],
          );
          worldEventRecorded = true;
        } catch (error) {
          // Event history is additive; interactions remain available until migration 003 is applied.
          logger.warn({ error, userId: user.id, targetId: target.id }, "world event history unavailable; apply migration 003_world_events.sql");
        }
        if (worldEventRecorded) {
          try {
            achievementsUnlocked = await recordWorldAchievements(user.id);
          } catch (error) {
            logger.warn({ error, userId: user.id }, "achievement evaluation unavailable; verify migration 005_world_achievements.sql");
          }
        }
        socket.emit(E.serverInteractResult, {
          targetId: target.id,
          questUpdates,
          questOffers,
          achievementsUnlocked,
          kind: target.kind,
          name: target.name,
          response: dialogue[0]?.text ?? target.response,
          dialogue,
          dialogueChoices,
          dialogueNodeId,
          dialogueNpcId,
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

    socket.on(E.clientVoiceSignal, async (raw) => {
      if (!(await ownsSocket())) return;
      const player = players.get(socket.id);
      const parsed = voiceSignalPayload.safeParse(raw);
      if (!player || !parsed.success || parsed.data.targetId === user.id) return;
      try {
        const allowed = await hit(`voice-signal-rate:${user.id}`, 40, 10);
        if (!allowed) return;
        const targetId = parsed.data.targetId;
        const target = await redis.hgetall(`presence:${targetId}`);
        const targetPosition = [Number(target.x), Number(target.y), Number(target.z)];
        const fresh = target.region === player.region.id
          && Number.isFinite(Number(target.heartbeatAt))
          && Date.now() - Number(target.heartbeatAt) <= 30_000
          && targetPosition.every(Number.isFinite)
          && await redis.get(`socket-owner:${targetId}`);
        if (!fresh || distance2D(player.pos, targetPosition as Vec3) > VOICE_RADIUS_M) {
          socket.emit(E.serverError, { code: "voice_too_far" });
          return;
        }
        const { targetId: _targetId, ...signal } = parsed.data;
        io.to(`player:${targetId}`).emit(E.serverVoiceSignal, { fromId: user.id, ...signal });
      } catch (error) {
        logger.warn({ error, userId: user.id }, "voice signaling relay failed");
        socket.emit(E.serverError, { code: "voice_unavailable" });
      }
    });

    socket.on(E.clientVoiceActivity, async (raw) => {
      if (!(await ownsSocket())) return;
      const player = players.get(socket.id);
      const parsed = voiceActivityPayload.safeParse(raw);
      if (!player || !parsed.success) return;
      try {
        // Activity is a tiny edge-triggered presence hint, never microphone media.
        const allowed = await hit(`voice-activity-rate:${user.id}`, 24, 10);
        if (!allowed) return;
        io.to(`region:${player.region.id}`).emit(E.serverVoiceActivity, {
          userId: user.id, active: parsed.data.active, at: Date.now(),
        });
      } catch (error) {
        logger.warn({ error, userId: user.id }, "voice activity relay failed");
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
      if (p) io.to(`region:${p.region.id}`).emit(E.serverVoiceActivity, { userId: user.id, active: false, at: Date.now() });
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

  // Schedule rows are cached; the world clock is resolved every second so a
  // schedule boundary is broadcast promptly without querying PostgreSQL at 10 Hz.
  let npcScheduleRows: NpcScheduleRow[] = [];
  let npcRowsLoadedAt = 0;
  let npcRefreshRunning = false;
  const npcFingerprints = new Map<string, string>();
  const npcRefresh = setInterval(async () => {
    if (npcRefreshRunning) return;
    npcRefreshRunning = true;
    try {
      if (Date.now() - npcRowsLoadedAt >= 30_000) {
        const result = await pool.query<NpcScheduleRow>(
          "SELECT id, region_id, name, title, schedule FROM world_npcs WHERE is_active = true ORDER BY region_id, id",
        );
        npcScheduleRows = result.rows;
        npcRowsLoadedAt = Date.now();
      }
      if (!npcScheduleRows.length) return;
      const snapshots = buildNpcRegionSnapshots(npcScheduleRows, getWorldClockMinute());
      npcPositionById.clear();
      scheduledNpcIds.clear();
      for (const snapshot of snapshots) {
        for (const npc of snapshot.npcs) {
          scheduledNpcIds.add(npc.id);
          if (npc.active && npc.state) npcPositionById.set(npc.id, { regionId: snapshot.regionId, position: npc.state.position });
        }
      }
      for (const snapshot of snapshots) {
        // worldMinute itself changes each minute; only broadcast when an NPC's
        // actual state changes, avoiding redundant room traffic.
        npcSnapshotByRegion.set(snapshot.regionId, snapshot);
        const fingerprint = JSON.stringify(snapshot.npcs);
        if (npcFingerprints.get(snapshot.regionId) === fingerprint) continue;
        npcFingerprints.set(snapshot.regionId, fingerprint);
        io.to(`region:${snapshot.regionId}`).emit(E.serverNpcState, snapshot);
      }
    } catch (error) {
      // Migration 006 is additive and may not yet exist in an older database.
      // Keep the gateway online; retry the read on the next refresh interval.
      npcRowsLoadedAt = Date.now();
      logger.warn({ error }, "NPC schedule snapshot refresh unavailable; verify migration 006_npc_daily_schedules.sql");
    } finally {
      npcRefreshRunning = false;
    }
  }, 1_000);
  npcRefresh.unref();

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
          const voicePeers = mePresence
            ? findNearbyPlayers(mePresence, index, VOICE_RADIUS_M)
              .filter((other) => other.userId !== me.userId)
              .sort((a, b) => distance2D(mePresence!.pos, a.pos) - distance2D(mePresence!.pos, b.pos))
              .slice(0, MAX_VOICE_PEERS)
              .map((other) => other.userId)
            : [];
          io.to(me.socketId).emit(E.serverVoicePeers, voicePeers);
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
