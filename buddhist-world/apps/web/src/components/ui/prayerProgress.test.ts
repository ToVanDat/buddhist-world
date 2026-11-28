import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRAYER_PROGRESS,
  incrementPrayerProgress,
  parsePrayerProgress,
  parseServerPrayerProgress,
  prayerProgressStorageKey,
  resetPrayerProgress,
  selectPrayerTarget,
} from "./prayerProgress";

describe("prayer progress", () => {
  it("namespaces local progress by account without storing raw identifiers", () => {
    expect(prayerProgressStorageKey("player/42")).toBe("bw.prayer.progress.v1:player%2F42");
    expect(prayerProgressStorageKey("")).toBe("bw.prayer.progress.v1:anonymous");
  });

  it("uses a safe default for empty, malformed, and unsupported browser data", () => {
    expect(parsePrayerProgress(null)).toEqual(DEFAULT_PRAYER_PROGRESS);
    expect(parsePrayerProgress("{")).toEqual(DEFAULT_PRAYER_PROGRESS);
    expect(parsePrayerProgress(JSON.stringify({ version: 9, count: 2, target: 108, sessions: 0 }))).toEqual(DEFAULT_PRAYER_PROGRESS);
  });

  it("hydrates the versionless account API response into the versioned local model", () => {
    const remote = { count: 54, target: 108 as const, sessions: 3, lastSessionAt: "2026-11-22T10:00:00.000Z" };
    expect(parseServerPrayerProgress(remote)).toEqual({ version: 1, ...remote });
    expect(parseServerPrayerProgress(null)).toBeNull();
    expect(parseServerPrayerProgress({ ...remote, count: 109 })).toEqual(DEFAULT_PRAYER_PROGRESS);
  });

  it("rejects negative, unsafe, and over-target counts", () => {
    for (const count of [-1, Number.MAX_SAFE_INTEGER + 1, 109]) {
      expect(parsePrayerProgress(JSON.stringify({ ...DEFAULT_PRAYER_PROGRESS, count }))).toEqual(DEFAULT_PRAYER_PROGRESS);
    }
  });

  it("restores a valid progress snapshot", () => {
    const snapshot = { ...DEFAULT_PRAYER_PROGRESS, count: 42, sessions: 3, lastSessionAt: "2026-11-22T10:00:00.000Z" };
    expect(parsePrayerProgress(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it("increments once and records a completed session only at the selected target", () => {
    const before = { ...DEFAULT_PRAYER_PROGRESS, count: 107 };
    const completed = incrementPrayerProgress(before, "2026-11-22T10:00:00.000Z");
    expect(completed).toMatchObject({ count: 108, sessions: 1, lastSessionAt: "2026-11-22T10:00:00.000Z" });
    expect(incrementPrayerProgress(completed, "2026-11-22T10:01:00.000Z")).toBe(completed);
  });

  it("does not reset progress when the already-selected target is clicked again", () => {
    const current = { ...DEFAULT_PRAYER_PROGRESS, count: 17 };
    expect(selectPrayerTarget(current, 108)).toBe(current);
  });

  it("resets the current count when choosing a new target without erasing history", () => {
    const current = { ...DEFAULT_PRAYER_PROGRESS, count: 17, sessions: 2 };
    expect(selectPrayerTarget(current, 27)).toMatchObject({ count: 0, target: 27, sessions: 2 });
    expect(resetPrayerProgress(current)).toMatchObject({ count: 0, target: 108, sessions: 2 });
  });
});
