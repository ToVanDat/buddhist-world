import { describe, expect, it } from "vitest";
import { resolveVoiceActivityPolicy } from "./activity-policy.js";

describe("server voice activity policy", () => {
  it("allows spatial proximity voice in the open world", () => {
    expect(resolveVoiceActivityPolicy(null)).toEqual({
      roomKind: "world", canPublish: true, activityType: null,
    });
  });

  it("keeps meditation sessions listen-only", () => {
    expect(resolveVoiceActivityPolicy({
      partyId: "party-1", activityType: "meditation", role: "leader",
    }).canPublish).toBe(false);
    expect(resolveVoiceActivityPolicy({
      partyId: "party-1", activityType: "meditation", role: "member",
    }).canPublish).toBe(false);
  });

  it("reserves Dharma talk, guided tour and ceremony microphones for the activity leader", () => {
    for (const activityType of ["dharma_talk", "guided_tour", "ceremony"] as const) {
      expect(resolveVoiceActivityPolicy({ partyId: "party-1", activityType, role: "leader" }).canPublish).toBe(true);
      expect(resolveVoiceActivityPolicy({ partyId: "party-1", activityType, role: "member" }).canPublish).toBe(false);
    }
  });

  it("allows party members to speak during a world visit", () => {
    expect(resolveVoiceActivityPolicy({
      partyId: "party-1", activityType: "world_visit", role: "member",
    }).canPublish).toBe(true);
  });
});
