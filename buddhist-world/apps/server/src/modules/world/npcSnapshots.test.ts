import { describe, expect, it } from "vitest";
import { buildNpcRegionSnapshots } from "./npcSnapshots.js";

const schedule = [
  { id: "morning", startMinute: 300, endMinute: 420, regionId: "temple_complex", position: [0, 1.2, -2], activity: "pray" },
  { id: "day", startMinute: 420, endMinute: 1020, regionId: "temple_complex", position: [8, 1.2, -17], activity: "talk" },
  { id: "night", startMinute: 1020, endMinute: 300, regionId: "temple_complex", position: [-8, 1.2, -34], activity: "rest" },
];

describe("buildNpcRegionSnapshots", () => {
  it("groups NPCs by region and resolves the active schedule entry", () => {
    const snapshots = buildNpcRegionSnapshots([
      { id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule },
      { id: "helper", region_id: "garden", name: "Helper", title: "Novice", schedule: [] },
    ], 480);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({ regionId: "garden", timeZone: "Asia/Ho_Chi_Minh" });
    expect(snapshots[1]?.npcs[0]).toMatchObject({ id: "guide", active: true, state: { id: "day" }, nextChangeMinute: 1020 });
  });

  it("publishes a time-resolved waypoint position for each region snapshot", () => {
    const patrol = [{
      id: "day-patrol", startMinute: 420, endMinute: 1020, regionId: "temple_complex",
      position: [0, 1.2, 0], path: [[0, 1.2, 0], [100, 1.2, 0]], speedMps: 1, activity: "walk",
    }];
    const atStart = buildNpcRegionSnapshots([
      { id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule: patrol },
    ], 420, 0);
    const tenSecondsLater = buildNpcRegionSnapshots([
      { id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule: patrol },
    ], 420, 10);
    expect(atStart[0]?.npcs[0]?.state?.position).toEqual([0, 1.2, 0]);
    expect(tenSecondsLater[0]?.npcs[0]?.state?.position).toEqual([10, 1.2, 0]);
  });

  it("returns an inactive NPC when the schedule has a gap", () => {
    const snapshots = buildNpcRegionSnapshots([
      { id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule: [schedule[0]] },
    ], 500);
    expect(snapshots[0]?.npcs[0]).toMatchObject({ active: false, state: null, nextChangeMinute: null });
  });

  it("rejects invalid and overlapping persisted schedule data", () => {
    expect(() => buildNpcRegionSnapshots([
      { id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule: [{ ...schedule[0], position: [0, 1] }] },
    ], 360)).toThrow(/invalid entry/i);
    expect(() => buildNpcRegionSnapshots([
      { id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule: [schedule[0], { ...schedule[1], startMinute: 400 }] },
    ], 410)).toThrow(/overlap/i);
  });
});
