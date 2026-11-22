import { describe, expect, it } from "vitest";
import { resolveRainRippleIntensity, resolveWaterWindInfluence, resolveWaterborneWindDrift } from "./WaterSurface";

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


describe("shared wind response for waterfall mist and foam", () => {
  it("scales drift by the shared wind, gust and turbulence sample", () => {
    const drift = resolveWaterborneWindDrift({
      directionX: 0,
      directionZ: 2,
      strength: 0.8,
      gust: 0.5,
      turbulence: 0.25,
      speed: 4,
      time: 2,
    });
    expect(drift.directionX).toBe(0);
    expect(drift.directionZ).toBe(1);
    expect(drift.strength).toBeCloseTo(0.8 * (0.65 + 0.5 * 0.2 + 0.25 * 0.1));
  });

  it("bounds the response scale and ignores invalid gust data", () => {
    const field = {
      directionX: 1,
      directionZ: 0,
      strength: 0.5,
      gust: Number.NaN,
      turbulence: Number.POSITIVE_INFINITY,
      speed: 3,
      time: 0,
    };
    expect(resolveWaterborneWindDrift(field, 10).strength).toBeCloseTo(0.5 * 0.65 * 2);
    expect(resolveWaterborneWindDrift(field, Number.NaN).strength).toBe(0);
  });

  it("keeps calm weather drift at zero when the shared wind strength is zero", () => {
    expect(resolveWaterborneWindDrift({
      directionX: 1,
      directionZ: 0,
      strength: 0,
      gust: 1,
      turbulence: 1,
      speed: 0,
      time: 0,
    }).strength).toBe(0);
  });
});
