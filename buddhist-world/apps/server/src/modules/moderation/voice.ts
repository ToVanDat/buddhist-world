import { TrackSource } from "livekit-server-sdk";
import { pool } from "../../db/pool.js";
import { redis } from "../../lib/redis.js";
import { liveKitRoomService, worldVoiceRoomName } from "../voice/livekit.js";
import { enforceVoiceMute } from "./voiceEnforcement.js";

export const voiceMuteKey = (userId: string) => `moderation:voice-muted:${userId}`;

export async function applyLiveVoicePermission(userId: string, muted: boolean) {
  const roomService = liveKitRoomService;
  if (!roomService) return { configured: false, activeRooms: 0, enforcementWarnings: 0 };
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
        WHERE pm.user_id = $1 AND pm.left_at IS NULL AND p.status IN ('open', 'in_activity')
        LIMIT 1`,
      [userId],
    );
    if (party.rows[0]) rooms.add(`bw-party-${party.rows[0].id}`);
  }

  let activeRooms = 0;
  let enforcementWarnings = 0;
  for (const room of rooms) {
    // A LiveKit API failure is not equivalent to an empty room. Propagate it so
    // moderation cannot report success when the active publisher was not checked.
    const participants = await roomService.listParticipants(room);
    const participant = participants.find((entry) => entry.identity === userId);
    if (!participant) continue;
    activeRooms += 1;

    if (muted) {
      const microphoneTracks = (participant.tracks ?? []).filter((track) =>
        track.source === TrackSource.MICROPHONE,
      );
      const result = await enforceVoiceMute({
        mutePublishedTracks: async () => {
          for (const track of microphoneTracks) {
            if (track.sid) await roomService.mutePublishedTrack(room, userId, track.sid, true);
          }
        },
        revokePublishPermission: async () => {
          await roomService.updateParticipant(room, userId, {
            permission: {
              canPublish: false,
              canPublishSources: [],
              canPublishData: false,
              canSubscribe: true,
            },
          });
        },
        removeParticipant: async () => {
          await roomService.removeParticipant(room, userId);
        },
      });
      if (result.trackMuteFailed || result.permissionUpdateFailed) enforcementWarnings += 1;
      continue;
    }

    await roomService.updateParticipant(room, userId, {
      permission: {
        canPublish: true,
        canPublishSources: [TrackSource.MICROPHONE],
        canPublishData: false,
        canSubscribe: true,
      },
    });
  }
  return { configured: true, activeRooms, enforcementWarnings };
}
