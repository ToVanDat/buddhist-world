import { MAX_VOICE_PEERS, VOICE_RADIUS_M, type Vec3 } from "@bw/shared";

export interface VoicePresence {
  userId: string;
  pos: Vec3;
}

/** Selects the nearest same-region listeners; callers must pass server-validated presence. */
export function selectNearbyVoicePlayers(listener: VoicePresence, players: VoicePresence[]) {
  return players
    .filter((speaker) => speaker.userId !== listener.userId
      && Math.hypot(listener.pos[0] - speaker.pos[0], listener.pos[2] - speaker.pos[2]) <= VOICE_RADIUS_M)
    .sort((a, b) => Math.hypot(listener.pos[0] - a.pos[0], listener.pos[2] - a.pos[2])
      - Math.hypot(listener.pos[0] - b.pos[0], listener.pos[2] - b.pos[2]))
    .slice(0, MAX_VOICE_PEERS);
}
