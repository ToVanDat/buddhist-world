import { Router } from "express";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { VOICE_RADIUS_M } from "@bw/shared";
import { env } from "../../config/env.js";
import { redis } from "../../lib/redis.js";
import { pool } from "../../db/pool.js";
import { logger } from "../../lib/logger.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { requireAuth } from "../auth/requireAuth.js";
import { liveKitConfigured, partyVoiceRoomName, worldVoiceRoomName } from "./livekit.js";
import { resolveVoiceActivityPolicy, type PartyVoiceActivity } from "./activity-policy.js";
import { voiceMuteKey } from "../moderation/voice.js";

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

    const partySchema = await pool.query<{ ready: boolean }>(
      "SELECT to_regclass('player_party_members') IS NOT NULL AND to_regclass('player_parties') IS NOT NULL AS ready",
    );
    const activity = partySchema.rows[0]?.ready
      ? await pool.query<{ party_id: string; activity_type: PartyVoiceActivity; role: "leader" | "member" }>(
          `SELECT p.id AS party_id, p.activity_type, pm.role
             FROM player_party_members pm
             JOIN player_parties p ON p.id = pm.party_id
            WHERE pm.user_id = $1 AND pm.left_at IS NULL AND p.status = 'in_activity'
            LIMIT 1`,
          [userId],
        )
      : { rows: [] as Array<{ party_id: string; activity_type: PartyVoiceActivity; role: "leader" | "member" }> };
    const activeParty = activity.rows[0];
    const voicePolicy = resolveVoiceActivityPolicy(activeParty ? {
      partyId: activeParty.party_id,
      activityType: activeParty.activity_type,
      role: activeParty.role,
    } : null);
    const room = activeParty ? partyVoiceRoomName(activeParty.party_id) : worldVoiceRoomName(presence.region!);
    const moderatedMute = Boolean(await redis.get(voiceMuteKey(userId)));
    const canPublish = voicePolicy.canPublish && !moderatedMute;
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: env.LIVEKIT_TOKEN_TTL_SEC,
      metadata: JSON.stringify({
        regionId: presence.region,
        kind: activeParty ? "party-activity" : "world-player",
        activityType: voicePolicy.activityType,
      }),
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish,
      canPublishSources: canPublish ? [TrackSource.MICROPHONE] : [],
      canPublishData: false,
      // Track-level SFU ACLs are applied by each publisher from the backend allowlist.\n      // Keep canSubscribe enabled: self-hosted LiveKit 1.13.x has an upstream limitation\n      // where RoomService UpdateSubscriptions fails for participants with canSubscribe=false.\n      canSubscribe: true,
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
      subscriptionMode: activeParty ? "party" : "publisher-acl",
      moderatedMute,
      tokenTtlSeconds: env.LIVEKIT_TOKEN_TTL_SEC,
    });
  } catch (error) {
    logger.error({ error, userId: req.auth?.sub }, "LiveKit token issuance failed");
    res.status(503).json({ error: "Không thể khởi tạo voice lúc này.", code: "VOICE_UNAVAILABLE" });
  }
});
