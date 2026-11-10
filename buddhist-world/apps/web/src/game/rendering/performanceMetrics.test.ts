import { describe, expect, it } from "vitest";
import { FrameTimeWindow, percentile, summarizeFrameTimes } from "./performanceMetrics";

describe("render performance metrics", () => {
  it("calculates bounded percentiles", () => {
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBe(50);
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });

  it("summarizes average, p95, p99, max and dropped frames", () => {
    expect(summarizeFrameTimes([10, 20, 30, 40])).toEqual({
      averageMs: 25, p95Ms: 40, p99Ms: 40, maxMs: 40, droppedFrames: 1,
    });
  });

  it("handles empty and invalid samples safely", () => {
    expect(summarizeFrameTimes([])).toEqual({
      averageMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, droppedFrames: 0,
    });
    expect(percentile([Number.NaN, Number.POSITIVE_INFINITY], 0.95)).toBe(0);
  });

  it("keeps only the latest values in a bounded ring buffer", () => {
    const window = new FrameTimeWindow(3);
    [10, 20, 30, 40].forEach((value) => window.push(value));
    expect(window.snapshot()).toEqual([20, 30, 40]);
    window.clear();
    expect(window.snapshot()).toEqual([]);
  });
});
