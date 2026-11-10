import { describe, expect, it } from "vitest";
import { resolveNpcSchedule, sampleNpcPatrol, validateNpcSchedule, type NpcScheduleEntry } from "./npcSchedule.js";

const schedule: NpcScheduleEntry[] = [
  { id: "morning-prayer", startMinute: 300, endMinute: 420, regionId: "temple_complex", position: [0, 0, 0], activity: "pray" },
  { id: "temple-work", startMinute: 420, endMinute: 1020, regionId: "temple_complex", position: [8, 0, -4], activity: "work" },
  { id: "night-rest", startMinute: 1020, endMinute: 300, regionId: "monk_quarters", position: [2, 0, 3], activity: "rest" },
];

describe("NPC daily schedule", () => {
  it("resolves start-inclusive and end-exclusive windows", () => {
    expect(resolveNpcSchedule(schedule, 300).entry?.id).toBe("morning-prayer");
    expect(resolveNpcSchedule(schedule, 419).entry?.id).toBe("morning-prayer");
    expect(resolveNpcSchedule(schedule, 420).entry?.id).toBe("temple-work");
  });

  it("supports schedules crossing midnight", () => {
    expect(resolveNpcSchedule(schedule, 23 * 60).entry?.id).toBe("night-rest");
    expect(resolveNpcSchedule(schedule, 0).entry?.id).toBe("night-rest");
    expect(resolveNpcSchedule(schedule, 299).entry?.id).toBe("night-rest");
    expect(resolveNpcSchedule(schedule, 300).entry?.id).toBe("morning-prayer");
  });

  it("returns no active entry when a schedule has a gap", () => {
    expect(resolveNpcSchedule([], 600)).toEqual({ entry: null, nextChangeMinute: null });
  });

  it("rejects invalid times, duplicate IDs and overlapping windows", () => {
    expect(() => validateNpcSchedule([{ ...schedule[0]!, startMinute: 1440 }])).toThrow();
    expect(() => validateNpcSchedule([schedule[0]!, { ...schedule[0]! }])).toThrow(/Duplicate/);
    expect(() => validateNpcSchedule([
      schedule[0]!,
      { ...schedule[1]!, startMinute: 400 },
    ])).toThrow(/overlap/);
    expect(() => validateNpcSchedule([
      { ...schedule[2]!, startMinute: 1260, endMinute: 300 },
      { ...schedule[0]!, startMinute: 0, endMinute: 20 },
    ])).toThrow(/overlap/);
  });

  it("moves along a patrol route deterministically and reverses at endpoints", () => {
    const path: [number, number, number][] = [[0, 0, 0], [10, 0, 0]];
    expect(sampleNpcPatrol(path, 2).position).toEqual([2, 0, 0]);
    expect(sampleNpcPatrol(path, 12).position).toEqual([8, 0, 0]);
    expect(sampleNpcPatrol(path, 20).position).toEqual([0, 0, 0]);
  });

  it("resolves a scheduled walking NPC at second-level precision", () => {
    const patrol: NpcScheduleEntry[] = [{
      id: "day-patrol", startMinute: 420, endMinute: 1020, regionId: "temple_complex",
      position: [0, 0, 0], path: [[0, 0, 0], [100, 0, 0]], speedMps: 1, activity: "walk",
    }];
    expect(resolveNpcSchedule(patrol, 420, 10).entry?.position).toEqual([10, 0, 0]);
    expect(resolveNpcSchedule(patrol, 420, 10).entry?.heading).toBeCloseTo(Math.PI / 2);
    expect(resolveNpcSchedule(patrol, 420, 20).entry?.position).toEqual([20, 0, 0]);
  });

  it("rejects malformed routes and unsafe patrol speeds", () => {
    expect(() => validateNpcSchedule([{
      ...schedule[0]!, path: [[1, 0, 0], [2, 0, 0]], speedMps: 1, activity: "walk",
    }])).toThrow(/invalid entry/i);
    expect(() => validateNpcSchedule([{
      ...schedule[0]!, path: [[0, 0, 0], [2, 0, 0]], speedMps: 10, activity: "walk",
    }])).toThrow(/invalid entry/i);
  });

  it("rejects invalid world clock values", () => {
    expect(() => resolveNpcSchedule(schedule, 1440)).toThrow(RangeError);
    expect(() => resolveNpcSchedule(schedule, 1.5)).toThrow(RangeError);
    expect(() => resolveNpcSchedule(schedule, 300, 60)).toThrow(RangeError);
  });
});
