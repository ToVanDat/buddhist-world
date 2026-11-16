import { Router } from "express";
import { AccessToken } from "livekit-server-sdk";
import { VOICE_RADIUS_M } from "@bw/shared";
import { env } from "../../config/env.js";
import { redis } from "../../lib/redis.js";
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

    const room = worldVoiceRoomName(presence.region);
    const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: userId,
      ttl: env.LIVEKIT_TOKEN_TTL_SEC,
      metadata: JSON.stringify({ regionId: presence.region, kind: "world-player" }),
    });
    token.addGrant({
      roomJoin: true,
      room,
      canPublish: true,
      canPublishSources: ["microphone"],
      canPublishData: false,
      canSubscribe: true,
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      url: env.LIVEKIT_PUBLIC_URL,
      token: await token.toJwt(),
      room,
      identity: userId,
      proximityRadiusMeters: VOICE_RADIUS_M,
      tokenTtlSeconds: env.LIVEKIT_TOKEN_TTL_SEC,
    });
  } catch (error) {
    req.log?.error?.({ error }, "LiveKit token issuance failed");
    res.status(503).json({ error: "Không thể khởi tạo voice lúc này.", code: "VOICE_UNAVAILABLE" });
  }
});
