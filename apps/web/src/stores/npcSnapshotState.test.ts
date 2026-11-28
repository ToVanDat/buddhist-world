import { describe, expect, it } from "vitest";
import { toNpcSnapshotState } from "./npcSnapshotState.js";
import type { NpcRegionSnapshot } from "@bw/shared";

const npc = (id: string) => ({
  id, name: id, title: "Guide", active: true,
  state: null, nextChangeMinute: null,
});

describe("toNpcSnapshotState", () => {
  it("replaces the previous view so NPCs absent from a new snapshot are removed", () => {
    const snapshot: NpcRegionSnapshot = {
      regionId: "temple_complex",
      worldMinute: 480,
      timeZone: "Asia/Ho_Chi_Minh",
      npcs: [npc("guide-new")],
    };
    const result = toNpcSnapshotState(snapshot);
    expect(Object.keys(result)).toEqual(["guide-new"]);
    expect(result["guide-old"]).toBeUndefined();
  });

  it("clears all NPCs for an explicit reset snapshot", () => {
    const snapshot: NpcRegionSnapshot = {
      regionId: "__reset__",
      worldMinute: 0,
      timeZone: "Asia/Ho_Chi_Minh",
      npcs: [],
    };
    expect(toNpcSnapshotState(snapshot)).toEqual({});
  });
});
