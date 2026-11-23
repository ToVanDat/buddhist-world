import { randomUUID } from "node:crypto";
import { RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { Vec3 } from "@bw/shared";
import { selectNearbyVoicePlayers } from "./proximity.js";
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

export function partyVoiceRoomName(partyId: string) {
  return `bw-party-${partyId}`;
}

/** Disconnect anyone who is no longer an active member of this Party. */
export async function reconcilePartyVoiceMembership(partyId: string, activeMemberIds: string[]) {
  if (!liveKitRoomService) return;
  const room = partyVoiceRoomName(partyId);
  const participants = await liveKitRoomService.listParticipants(room).catch(() => []);
  const allowed = new Set(activeMemberIds);
  const stale = participants.filter((participant) => !allowed.has(participant.identity));
  const results = await Promise.allSettled(stale.map((participant) => liveKitRoomService!.removeParticipant(room, participant.identity)));
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("One or more former Party members could not be removed from the LiveKit room.");
  }
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
  const acquired = await redis.set(lockKey, lockToken, "PX", 10_000, "NX");
  if (acquired !== "OK") return;

  const room = worldVoiceRoomName(regionId);
  try {
    const participants = await liveKitRoomService.listParticipants(room);
    if (!participants.length) return;

    // Only the backend-minted microphone grant can publish in this room.
    const playerParticipants = participants.filter((participant) => {
      const kind = String(participant.kind ?? "").toUpperCase();
      const kindNumber = Number(participant.kind);
      return !["EGRESS", "INGRESS", "AGENT", "SIP", "CONNECTOR"].includes(kind)
        && ![1, 2, 3, 4].includes(kindNumber);
    });
    const publishedTracks = new Map(
      playerParticipants.map((participant) => [
        participant.identity,
        (participant.tracks ?? [])
          .filter((track) => track.source === TrackSource.MICROPHONE)
          .map((track) => track.sid).filter(Boolean),
      ]),
    );
    const presentIds = new Set(players.map((player) => player.userId));

    for (const listener of players) {
      const stateKey = `voice-subscriptions:${regionId}:${listener.userId}`;
      if (!publishedTracks.has(listener.userId)) {
        await redis.del(stateKey);
        continue;
      }
      const allowedSpeakers = selectNearbyVoicePlayers(listener, players)
        .filter((speaker) => publishedTracks.has(speaker.userId));

      const desired = new Set(allowedSpeakers.flatMap((speaker) => publishedTracks.get(speaker.userId) ?? []));
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
