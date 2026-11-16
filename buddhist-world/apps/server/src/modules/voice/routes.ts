import { Router } from "express";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { VOICE_RADIUS_M } from "@bw/shared";
import { env } from "../../config/env.js";
import { redis } from "../../lib/redis.js";
import { pool } from "../../db/pool.js";
import { logger } from "../../lib/logger.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { requireAuth } from "../auth/requireAuth.js";
import { liveKitConfigured, worldVoiceRoomName } from "./livekit.js";

export const voiceRouter = Router();

/**
 * Issues a short-lived token for the player's authoritative current world region.
 * Clients cannot choose a room, identity, region or publish source.
 */
voiceRouter.post("/token", rateLimit("voice-token", 12, 60), requireAuth, async (req, res) => {
  if (!liveKitConfigured) {
    res.status(503).json({ error: "Hạ tầng voice chưa được cấu hình.", code: "VOICE_NOT_CONFIGURED" });
    return;
  }

  try {
    const userId = req.auth!.sub;
    const [presence, owner] = await Promise.all([
      redis.hgetall(`presence:${userId}`),
      redis.get(`socket-owner:${userId}`),
    ]);
    const position = [Number(presence.x), Number(presence.y), Number(presence.z)];
    const heartbeatAt = Number(presence.heartbeatAt);
    const fresh = Boolean(owner)
      && Boolean(presence.region)
      && Number.isFinite(heartbeatAt)
      && Date.now() - heartbeatAt <= 30_000
      && position.every(Number.isFinite);

    if (!fresh) {
      res.status(409).json({ error: "Bạn cần vào thế giới trước khi kết nối voice.", code: "VOICE_REQUIRES_WORLD_PRESENCE" });
      return;
    }

    const activity = await pool.query<{ party_id: string; activity_type: string; role: string }>(
      `SELECT p.id AS party_id, p.activity_type, pm.role
         FROM player_party_members pm
         JOIN player_parties p ON p.id = pm.party_id
        WHERE pm.user_id = $1 AND pm.left_at IS NULL AND p.status = 'in_activity'
        LIMIT 1`,
      [userId],
    );
    const activeParty = activity.rows[0];
    const room = activeParty
      ? `bw-party-${activeParty.party_id}`
      : worldVoiceRoomName(presence.region!);
    const canPublish = !activeParty
      || activeParty.activity_type === "world_visit"
      || (["dharma_talk", "guided_tour", "ceremony"].includes(activeParty.activity_type) && activeParty.role === "leader");
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: env.LIVEKIT_TOKEN_TTL_SEC,
      metadata: JSON.stringify({
        regionId: presence.region,
        kind: activeParty ? "party-activity" : "world-player",
        activityType: activeParty?.activity_type ?? null,
      }),
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish,
      canPublishSources: canPublish ? [TrackSource.MICROPHONE] : [],
      canPublishData: false,
      canSubscribe: true,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      url: env.LIVEKIT_PUBLIC_URL,
      token: await token.toJwt(),
      room,
      identity: userId,
      proximityRadiusMeters: activeParty ? 0 : VOICE_RADIUS_M,
      activityType: activeParty?.activity_type ?? null,
      canPublish,
      tokenTtlSeconds: env.LIVEKIT_TOKEN_TTL_SEC,
    });
  } catch (error) {
    logger.error({ error, userId: req.auth?.sub }, "LiveKit token issuance failed");
    res.status(503).json({ error: "Không thể khởi tạo voice lúc này.", code: "VOICE_UNAVAILABLE" });
  }
});
