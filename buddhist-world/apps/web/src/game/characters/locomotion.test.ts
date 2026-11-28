import { describe, expect, it } from "vitest";
import { TEMPLE_LAYOUT } from "@bw/shared";
import {
  GROUND_PROBE_DISTANCE,
  isFiniteWorldPosition,
  isWithinWorldBounds,
  resolveFiniteSpawnPosition,
  PLAYER_CAPSULE_HALF_EXTENT,
  resolveGroundProbeOrigin,
  isPlayerWading,
  resolveHorizontalVelocity,
  resolveFrameDelta,
} from "./locomotion";

describe("spawn and network position validation", () => {
  it("accepts positions inside the region and its physics tolerance", () => {
    expect(isWithinWorldBounds([0, 1.2, 20])).toBe(true);
    expect(isWithinWorldBounds([121, 1.2, 20])).toBe(true);
  });
  it("rejects positions beyond the playable region or malformed bounds inputs", () => {
    expect(isWithinWorldBounds([123, 1.2, 20])).toBe(false);
    expect(isWithinWorldBounds([0, -7, 20])).toBe(false);
    expect(isWithinWorldBounds([0, Number.NaN, 20])).toBe(false);
  });

  it("preserves valid spawn coordinates", () => {
    expect(resolveFiniteSpawnPosition([3, 1.2, -8])).toEqual([3, 1.2, -8]);
  });
  it("falls back to the main entrance for malformed spawn coordinates", () => {
    expect(resolveFiniteSpawnPosition([Number.NaN, 1.2, 0])).toEqual(TEMPLE_LAYOUT.spawns.mainEntrance.position);
    expect(resolveFiniteSpawnPosition([0, Number.POSITIVE_INFINITY, 0])).toEqual(TEMPLE_LAYOUT.spawns.mainEntrance.position);
  });
  it("accepts only finite three-dimensional network positions", () => {
    expect(isFiniteWorldPosition([1, 2, 3])).toBe(true);
    expect(isFiniteWorldPosition([1, Number.NaN, 3])).toBe(false);
    expect(isFiniteWorldPosition([1, 2])).toBe(false);
  });
});

describe("realistic horizontal locomotion response", () => {
  it("clamps invalid and excessive frame deltas", () => {
    expect(resolveFrameDelta(0.016)).toBe(0.016);
    expect(resolveFrameDelta(1)).toBe(0.05);
    expect(resolveFrameDelta(-1)).toBe(0);
    expect(resolveFrameDelta(Number.NaN)).toBe(0);
    expect(resolveFrameDelta(Number.POSITIVE_INFINITY)).toBe(0);
  });
  it("aligns the meditation spawn with the physical platform top", () => {
    const spot = TEMPLE_LAYOUT.meditationSpot;
    const platformTop = spot.position[1] + spot.platformThickness / 2;
    expect(spot.playerCenterY - PLAYER_CAPSULE_HALF_EXTENT).toBeCloseTo(platformTop, 6);
  });

  it("does not report grounded at the spawn height", () => {
    const origin = resolveGroundProbeOrigin([0, 1.2, 0]);
    expect(origin[1]).toBeCloseTo(0.48);
    expect(origin[1]).toBeGreaterThan(GROUND_PROBE_DISTANCE);
  });

  it("reaches the floor when the capsule rests on level ground", () => {
    const origin = resolveGroundProbeOrigin([0, 0.8, 0]);
    expect(origin[1]).toBeCloseTo(0.08);
    expect(origin[1]).toBeLessThan(GROUND_PROBE_DISTANCE);
  });

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

  it("resets malformed velocity vectors instead of propagating NaN or Infinity", () => {
    expect(resolveHorizontalVelocity([Number.NaN, 0], [3, 0], 0.016, true)).toEqual([0, 0]);
    expect(resolveHorizontalVelocity([1, 0], [Number.POSITIVE_INFINITY, 0], 0.016, true)).toEqual([0, 0]);
  });

  it("accelerates through a direction change without an instantaneous velocity snap", () => {
    const next = resolveHorizontalVelocity([3.2, 0], [-3.2, 0], 0.016, true);
    expect(next[0]).toBeGreaterThan(2.9);
    expect(next[0]).toBeLessThan(3.2);
  });
});


describe("lotus pond wading detection", () => {
  it("applies water movement only when the capsule reaches the pond surface", () => {
    expect(isPlayerWading([-18, 0.8, 4])).toBe(true);
  });

  it("does not apply water drag to a bridge or raised path above the pond", () => {
    expect(isPlayerWading([-18, 1.5, 4])).toBe(false);
  });

  it("does not apply water movement outside the pond footprint", () => {
    expect(isPlayerWading([-9, 0.8, 4])).toBe(false);
  });

  it("rejects malformed player coordinates", () => {
    expect(isPlayerWading([Number.NaN, 0.8, 4])).toBe(false);
  });
});
