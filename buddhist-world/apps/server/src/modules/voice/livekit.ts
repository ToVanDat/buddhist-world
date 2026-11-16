import { randomUUID } from "node:crypto";
import { RoomServiceClient } from "livekit-server-sdk";
import { MAX_VOICE_PEERS, VOICE_RADIUS_M, type Vec3 } from "@bw/shared";
import { env } from "../../config/env.js";
import { redis } from "../../lib/redis.js";

export const liveKitConfigured = Boolean(
  env.LIVEKIT_INTERNAL_URL && env.LIVEKIT_PUBLIC_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET,
);

export const liveKitRoomService = liveKitConfigured
  ? new RoomServiceClient(env.LIVEKIT_INTERNAL_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET)
  : null;

export function worldVoiceRoomName(regionId: string) {
  return `bw-world-${regionId}`;
}

export interface VoicePresence {
  userId: string;
  pos: Vec3;
}

/**
 * Reconcile SFU subscriptions from server-owned region presence. The browser
 * connects with autoSubscribe=false; this service subscribes only the nearest
 * same-region microphone tracks within the configured radius.
 */
export async function reconcileRegionVoiceSubscriptions(regionId: string, players: VoicePresence[]) {
  if (!liveKitRoomService || players.length === 0) return;

  const lockKey = `voice-reconcile-lock:${regionId}`;
  const lockToken = randomUUID();
  const acquired = await redis.set(lockKey, lockToken, "PX", 2_000, "NX");
  if (acquired !== "OK") return;

  const room = worldVoiceRoomName(regionId);
  try {
    const participants = await liveKitRoomService.listParticipants(room);
    if (!participants.length) return;

    // Only the backend-minted microphone grant can publish in this room.
    const publishedTracks = new Map(
      participants.map((participant) => [
        participant.identity,
        (participant.tracks ?? []).map((track) => track.sid).filter(Boolean),
      ]),
    );
    const presentIds = new Set(players.map((player) => player.userId));

    for (const listener of players) {
      if (!publishedTracks.has(listener.userId)) continue;
      const allowedSpeakers = players
        .filter((speaker) => speaker.userId !== listener.userId
          && publishedTracks.has(speaker.userId)
          && Math.hypot(
            listener.pos[0] - speaker.pos[0],
            listener.pos[2] - speaker.pos[2],
          ) <= VOICE_RADIUS_M)
        .sort((a, b) => Math.hypot(listener.pos[0] - a.pos[0], listener.pos[2] - a.pos[2])
          - Math.hypot(listener.pos[0] - b.pos[0], listener.pos[2] - b.pos[2]))
        .slice(0, MAX_VOICE_PEERS);

      const desired = new Set(allowedSpeakers.flatMap((speaker) => publishedTracks.get(speaker.userId) ?? []));
      const stateKey = `voice-subscriptions:${regionId}:${listener.userId}`;
      const previousRaw = await redis.get(stateKey);
      let previous: string[] = [];
      if (previousRaw) {
        try {
          const parsed: unknown = JSON.parse(previousRaw);
          if (Array.isArray(parsed)) previous = parsed.filter((value): value is string => typeof value === "string");
        } catch { /* Invalid cache is reconciled as an empty set. */ }
      }
      const previousSet = new Set(previous);
      const subscribe = [...desired].filter((sid) => !previousSet.has(sid));
      const unsubscribe = previous.filter((sid) => !desired.has(sid));

      if (subscribe.length) await liveKitRoomService.updateSubscriptions(room, listener.userId, subscribe, true);
      if (unsubscribe.length) await liveKitRoomService.updateSubscriptions(room, listener.userId, unsubscribe, false);
      await redis.set(stateKey, JSON.stringify([...desired]), "EX", 30);
    }

    // Expire cache entries for players no longer present. LiveKit itself removes
    // their subscriptions when the participant disconnects.
    const memberIds = await redis.smembers(`presence-region:${regionId}`);
    for (const userId of memberIds) {
      if (presentIds.has(userId)) continue;
      await redis.del(`voice-subscriptions:${regionId}:${userId}`);
    }
  } finally {
    await redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1, lockKey, lockToken,
    ).catch(() => 0);
  }
}
