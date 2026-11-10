import { describe, expect, it } from "vitest";
import { resolveRainRippleIntensity } from "./WaterSurface";

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
  });
});
