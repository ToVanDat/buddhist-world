import { describe, expect, it } from "vitest";
import { isNearTourStop, sanitizeVisitedSpawnIds } from "./tourProgress.js";

describe("server-authoritative temple tour progress", () => {
  const stop: [number, number, number] = [0, 1, 0];

  it("accepts a player inside the horizontal and vertical visit radius", () => {
    expect(isNearTourStop([6, 4, 8], "temple_complex", "temple_complex", stop)).toBe(true);
  });

  it("rejects a player outside the radius, in another region, or on another floor", () => {
    expect(isNearTourStop([10.01, 1, 0], "temple_complex", "temple_complex", stop)).toBe(false);
    expect(isNearTourStop([0, 1, 0], "garden", "temple_complex", stop)).toBe(false);
    expect(isNearTourStop([0, 5.51, 0], "temple_complex", "temple_complex", stop)).toBe(false);
  });

  it("rejects non-finite coordinates", () => {
    expect(isNearTourStop([Number.NaN, 1, 0], "temple_complex", "temple_complex", stop)).toBe(false);
  });

  it("sanitizes, deduplicates and sorts only manifest stop IDs", () => {
    expect(sanitizeVisitedSpawnIds(["gate", "gate", "unknown", 4, "hall"], ["gate", "hall"]))
      .toEqual(["gate", "hall"]);
  });
});
