import { describe, expect, it } from "vitest";
import { resolveHorizontalVelocity } from "./locomotion";

describe("realistic horizontal locomotion response", () => {
  it("accelerates progressively instead of jumping to full speed", () => {
    const next = resolveHorizontalVelocity([0, 0], [3.2, 0], 0.016, true);
    expect(next[0]).toBeCloseTo(0.224);
    expect(next[1]).toBe(0);
    expect(next[0]).toBeLessThan(3.2);
  });

  it("brakes smoothly when movement input is released", () => {
    const next = resolveHorizontalVelocity([3.2, 0], [0, 0], 0.05, true);
    expect(next[0]).toBeCloseTo(2.3);
  });

  it("limits air control compared with grounded acceleration", () => {
    const grounded = resolveHorizontalVelocity([0, 0], [6, 0], 0.05, true);
    const airborne = resolveHorizontalVelocity([0, 0], [6, 0], 0.05, false);
    expect(grounded[0]).toBeCloseTo(0.7);
    expect(airborne[0]).toBeCloseTo(0.25);
    expect(airborne[0]).toBeLessThan(grounded[0]);
  });

  it("does not overshoot a reachable target velocity", () => {
    expect(resolveHorizontalVelocity([0.1, 0], [0.2, 0], 0.05, true)).toEqual([0.2, 0]);
  });

  it("caps large frame deltas and treats invalid deltas as zero", () => {
    expect(resolveHorizontalVelocity([0, 0], [6, 0], 1, true)).toEqual(
      resolveHorizontalVelocity([0, 0], [6, 0], 0.05, true),
    );
    expect(resolveHorizontalVelocity([1, 2], [6, 0], Number.NaN, true)).toEqual([1, 2]);
    expect(resolveHorizontalVelocity([1, 2], [6, 0], -1, true)).toEqual([1, 2]);
  });

  it("accelerates through a direction change without an instantaneous velocity snap", () => {
    const next = resolveHorizontalVelocity([3.2, 0], [-3.2, 0], 0.016, true);
    expect(next[0]).toBeGreaterThan(2.9);
    expect(next[0]).toBeLessThan(3.2);
  });
});
