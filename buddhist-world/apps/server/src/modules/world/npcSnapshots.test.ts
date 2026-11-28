import { describe, expect, it } from "vitest";
import { buildNpcRegionSnapshots, routeNpcScheduleRows } from "./npcSnapshots.js";

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


  it("fails closed when a schedule entry targets a different region", () => {
    const mismatched = [{
      id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk",
      schedule: [{ ...schedule[0]!, regionId: "garden" }],
    }];
    const snapshots = buildNpcRegionSnapshots(mismatched, 360);
    expect(snapshots[0]?.npcs[0]).toMatchObject({ active: false, state: null });
    const routed = routeNpcScheduleRows(mismatched, () => {
      throw new Error("A mismatched region must never be path-routed");
    });
    expect((routed[0]!.schedule as unknown[])).toEqual([]);
  });

  it("returns an inactive NPC when the schedule has a gap", () => {
    const snapshots = buildNpcRegionSnapshots([
      { id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule: [schedule[0]] },
    ], 500);
    expect(snapshots[0]?.npcs[0]).toMatchObject({ active: false, state: null, nextChangeMinute: null });
  });

  it("isolates malformed and overlapping schedules to the affected NPC", () => {
    const snapshots = buildNpcRegionSnapshots([
      { id: "broken-position", region_id: "temple_complex", name: "Broken", title: "Monk", schedule: [{ ...schedule[0]!, position: [0, 1] }] },
      { id: "overlapping", region_id: "temple_complex", name: "Overlap", title: "Monk", schedule: [schedule[0]!, { ...schedule[1]!, startMinute: 400 }] },
      { id: "healthy", region_id: "temple_complex", name: "Healthy", title: "Monk", schedule: [schedule[0]!] },
    ], 360);
    expect(snapshots[0]?.npcs).toHaveLength(3);
    expect(snapshots[0]?.npcs.find((npc) => npc.id === "broken-position")).toMatchObject({ active: false, state: null });
    expect(snapshots[0]?.npcs.find((npc) => npc.id === "overlapping")).toMatchObject({ active: false, state: null });
    expect(snapshots[0]?.npcs.find((npc) => npc.id === "healthy")).toMatchObject({ active: true, state: { id: "morning" } });
  });
});

describe("routeNpcScheduleRows", () => {
  const walking = [{
    id: "day-patrol", startMinute: 420, endMinute: 1020, regionId: "temple_complex",
    position: [0, 1.2, 0], path: [[0, 1.2, 0], [4, 1.2, 0]], speedMps: 0.7, activity: "walk",
  }];
  const rows = [{ id: "guide", region_id: "temple_complex", name: "Guide", title: "Monk", schedule: walking }];

  it("replaces authored segments with server pathfinder output", () => {
    const routed = routeNpcScheduleRows(rows, (_region, start, end) => [start, [2, 1.2, 2], end]);
    expect((routed[0]!.schedule as typeof walking)[0]!.path).toEqual([
      [0, 1.2, 0], [2, 1.2, 2], [4, 1.2, 0],
    ]);
  });

  it("fails closed instead of publishing waypoint movement when no baked mesh is installed", () => {
    const unavailable = routeNpcScheduleRows(rows, () => undefined);
    expect((unavailable[0]!.schedule as Array<{activity:string;path?:unknown;speedMps?:number}>)[0]).toMatchObject({
      activity: "idle", path: undefined, speedMps: undefined,
    });
  });

  it("stops an NPC when the installed navmesh cannot connect a route", () => {
    const blocked = routeNpcScheduleRows(rows, () => null);
    expect((blocked[0]!.schedule as Array<{activity:string;path?:unknown}>)[0]).toMatchObject({
      activity: "idle", path: undefined,
    });
  });

  it("isolates a pathfinder exception to the affected NPC", () => {
    const multipleRows = [
      ...rows,
      { id: "healthy-guide", region_id: "temple_complex", name: "Healthy", title: "Monk", schedule: walking },
    ];
    const routed = routeNpcScheduleRows(multipleRows, (_region, start, end) => {
      if (start[0] === 0) throw new Error("pathfinder unavailable for this route");
      return [start, end];
    });
    expect((routed[0]!.schedule as Array<{activity:string;path?:unknown}>)[0]).toMatchObject({
      activity: "idle", path: undefined,
    });
    expect((routed[1]!.schedule as typeof walking)[0]!.path).toEqual(walking[0]!.path);
  });
});
