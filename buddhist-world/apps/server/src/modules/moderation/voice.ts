import { TrackSource } from "livekit-server-sdk";
import { pool } from "../../db/pool.js";
import { redis } from "../../lib/redis.js";
import { liveKitRoomService, worldVoiceRoomName } from "../voice/livekit.js";

export const voiceMuteKey = (userId: string) => `moderation:voice-muted:${userId}`;

export async function applyLiveVoicePermission(userId: string, muted: boolean) {
  if (!liveKitRoomService) return { configured: false, activeRooms: 0 };
  const presence = await redis.hgetall(`presence:${userId}`);
  const rooms = new Set<string>();
  if (presence.region) rooms.add(worldVoiceRoomName(presence.region));

  const partySchema = await pool.query<{ ready: boolean }>(
    "SELECT to_regclass('player_party_members') IS NOT NULL AND to_regclass('player_parties') IS NOT NULL AS ready",
  );
  if (partySchema.rows[0]?.ready) {
    const party = await pool.query<{ id: string }>(
      `SELECT p.id FROM player_party_members pm
         JOIN player_parties p ON p.id = pm.party_id
        WHERE pm.user_id = $1 AND pm.left_at IS NULL AND p.status = 'in_activity'
        LIMIT 1`,
      [userId],
    );
    if (party.rows[0]) rooms.add(`bw-party-${party.rows[0].id}`);
  }

  let activeRooms = 0;
  for (const room of rooms) {
    let participants;
    try { participants = await liveKitRoomService.listParticipants(room); }
    catch { continue; }
    const participant = participants.find((entry) => entry.identity === userId);
    if (!participant) continue;
    activeRooms += 1;
    if (muted) {
      const microphoneTracks = (participant.tracks ?? []).filter((track) =>
        track.source === TrackSource.MICROPHONE,
      );
      for (const track of microphoneTracks) {
        if (track.sid) await liveKitRoomService.mutePublishedTrack(room, userId, track.sid, true);
      }
    }
    await liveKitRoomService.updateParticipant(room, userId, {
      permission: {
        canPublish: !muted,
        canPublishSources: muted ? [] : [TrackSource.MICROPHONE],
        canPublishData: false,
        canSubscribe: true,
      },
    });
    if (muted) {
      // Permission updates revoke the current token; disconnect the participant
      // so the client must obtain a fresh token after the moderation TTL expires.
      await liveKitRoomService.removeParticipant(room, userId);
    }
  }
  return { configured: true, activeRooms };
}
