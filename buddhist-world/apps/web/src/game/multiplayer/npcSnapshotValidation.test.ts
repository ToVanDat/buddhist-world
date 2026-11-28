import { describe, expect, it } from "vitest";
import { getRegion, type NpcRegionSnapshot } from "@bw/shared";
import { validateNpcRegionSnapshot } from "./npcSnapshotValidation.js";

const region = getRegion("temple_complex")!;
const valid: NpcRegionSnapshot = {
  regionId: region.id,
  worldMinute: 480,
  timeZone: "Asia/Ho_Chi_Minh",
  npcs: [{
    id: "guide", name: "Guide", title: "Monk", active: true,
    state: {
      id: "morning", startMinute: 300, endMinute: 600, regionId: region.id,
      position: [...region.spawns[0]!.position], activity: "pray",
    },
    nextChangeMinute: 600,
  }],
};

describe("NPC region snapshot validation", () => {
  it("accepts a valid snapshot for the active region", () => {
    expect(validateNpcRegionSnapshot(valid, region.id)).toEqual(valid);
  });

  it("rejects snapshots for a stale or unknown region", () => {
    expect(validateNpcRegionSnapshot(valid, "garden")).toBeNull();
    expect(validateNpcRegionSnapshot(valid, null)).toBeNull();
    expect(validateNpcRegionSnapshot({ ...valid, regionId: "missing" }, region.id)).toBeNull();
  });

  it("rejects invalid clock metadata and timezone", () => {
    expect(validateNpcRegionSnapshot({ ...valid, worldMinute: 1440 }, region.id)).toBeNull();
    expect(validateNpcRegionSnapshot({ ...valid, timeZone: "UTC" }, region.id)).toBeNull();
  });

  it("rejects duplicate NPC IDs and malformed display fields", () => {
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [...valid.npcs, valid.npcs[0]!] }, region.id)).toBeNull();
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...valid.npcs[0]!, name: " " }] }, region.id)).toBeNull();
  });

  it("rejects state whose region, position, or active flag is inconsistent", () => {
    const npc = valid.npcs[0]!;
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...npc, state: { ...npc.state!, regionId: "garden" } }] }, region.id)).toBeNull();
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...npc, state: { ...npc.state!, position: [999, 0, 0] } }] }, region.id)).toBeNull();
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...npc, active: false }] }, region.id)).toBeNull();
  });

  it("rejects non-finite, repeated, or oversized patrol paths", () => {
    const npc = valid.npcs[0]!;
    const state = { ...npc.state!, activity: "walk" as const, path: [
      [...region.spawns[0]!.position] as [number, number, number],
      [Number.NaN, 1, 0] as [number, number, number],
    ] };
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...npc, state }] }, region.id)).toBeNull();
    const repeated = { ...state, path: [state.position, state.position] };
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...npc, state: repeated }] }, region.id)).toBeNull();
    const oversized = { ...state, path: Array.from({ length: 257 }, (_, i) => [i, 1, 0] as [number, number, number]) };
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...npc, state: oversized }] }, region.id)).toBeNull();
  });

  it("rejects patrol metadata outside the allowed speed range", () => {
    const npc = valid.npcs[0]!;
    const state = { ...npc.state!, activity: "walk" as const, path: [
      [...region.spawns[0]!.position] as [number, number, number],
      [region.spawns[0]!.position[0] + 1, region.spawns[0]!.position[1], region.spawns[0]!.position[2]] as [number, number, number],
    ], speedMps: 99 };
    expect(validateNpcRegionSnapshot({ ...valid, npcs: [{ ...npc, state }] }, region.id)).toBeNull();
  });
});
