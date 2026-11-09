import { describe, expect, it } from "vitest";
import { resolveNpcSchedule, validateNpcSchedule, type NpcScheduleEntry } from "./npcSchedule.js";

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
  });

  it("rejects invalid world clock values", () => {
    expect(() => resolveNpcSchedule(schedule, 1440)).toThrow(RangeError);
    expect(() => resolveNpcSchedule(schedule, 1.5)).toThrow(RangeError);
  });
});
