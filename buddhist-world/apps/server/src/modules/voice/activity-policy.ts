export type PartyVoiceActivity =
  | "meditation"
  | "dharma_talk"
  | "ceremony"
  | "guided_tour"
  | "world_visit";

export interface ActivePartyVoiceContext {
  partyId: string;
  activityType: PartyVoiceActivity;
  role: "leader" | "member";
}

export interface VoiceActivityPolicy {
  roomKind: "world" | "party";
  canPublish: boolean;
  activityType: PartyVoiceActivity | null;
}

/** Server-authoritative policy: quiet practice is listen-only; hosted activities reserve the mic for the leader. */
export function resolveVoiceActivityPolicy(party: ActivePartyVoiceContext | null): VoiceActivityPolicy {
  if (!party) return { roomKind: "world", canPublish: true, activityType: null };
  if (party.activityType === "world_visit") {
    return { roomKind: "party", canPublish: true, activityType: party.activityType };
  }
  if (party.activityType === "meditation") {
    return { roomKind: "party", canPublish: false, activityType: party.activityType };
  }
  return {
    roomKind: "party",
    canPublish: party.role === "leader",
    activityType: party.activityType,
  };
}
