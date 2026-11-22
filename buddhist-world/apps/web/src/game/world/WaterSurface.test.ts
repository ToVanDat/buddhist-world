import { describe, expect, it } from "vitest";
import { resolveRainRippleIntensity, resolveWaterWindInfluence } from "./WaterSurface";

describe("rain-responsive water surface", () => {
  it("only adds ripple energy during rain", () => {
    expect(resolveRainRippleIntensity("rain", 0.8)).toBe(0.8);
    expect(resolveRainRippleIntensity("fog", 0.8)).toBe(0);
    expect(resolveRainRippleIntensity("cloudy", 1)).toBe(0);
    expect(resolveRainRippleIntensity("clear", 1)).toBe(0);
  });

  it("clamps invalid and out-of-range intensity", () => {
    expect(resolveRainRippleIntensity("rain", -2)).toBe(0);
    expect(resolveRainRippleIntensity("rain", 4)).toBe(1);
    expect(resolveRainRippleIntensity("rain", Number.NaN)).toBe(0);
    expect(resolveRainRippleIntensity("rain", Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("shared wind response for pond water", () => {
  it("normalizes the world wind direction and clamps its strength", () => {
    expect(resolveWaterWindInfluence({ directionX: 3, directionZ: 4, strength: 1.4 })).toEqual({
      directionX: 0.6,
      directionZ: 0.8,
      strength: 1,
    });
  });

  it("uses a stable fallback direction for a zero or invalid vector", () => {
    expect(resolveWaterWindInfluence({ directionX: 0, directionZ: 0, strength: -1 })).toEqual({
      directionX: 1,
      directionZ: 0,
      strength: 0,
    });
    expect(resolveWaterWindInfluence({ directionX: Number.NaN, directionZ: 0, strength: Number.NaN })).toEqual({
      directionX: 1,
      directionZ: 0,
      strength: 0,
    });
  });
});
