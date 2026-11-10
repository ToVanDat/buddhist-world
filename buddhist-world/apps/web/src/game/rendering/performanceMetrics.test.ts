import { describe, expect, it } from "vitest";
import { percentile, summarizeFrameTimes } from "./performanceMetrics";

describe("render performance metrics", () => {
  it("calculates a bounded percentile from frame-time samples", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBe(50);
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });
  it("summarizes average and p95 frame time", () => {
    expect(summarizeFrameTimes([10, 20, 30])).toEqual({ averageMs: 20, p95Ms: 30 });
  });
  it("handles empty and invalid samples safely", () => {
    expect(summarizeFrameTimes([])).toEqual({ averageMs: 0, p95Ms: 0 });
    expect(percentile([Number.NaN, Number.POSITIVE_INFINITY], 0.95)).toBe(0);
  });
});
