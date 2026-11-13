import { describe, expect, it } from "vitest";
import { resolveWetSurfaceParameters } from "./WeatherReactiveMaterial";

describe("resolveWetSurfaceParameters", () => {
  it("preserves dry material response in clear weather", () => {
    expect(resolveWetSurfaceParameters(0.8, 0.1, "clear", 1)).toEqual({
      roughness: 0.8,
      clearcoat: 0.1,
      clearcoatRoughness: 0.32,
    });
  });

  it("reduces roughness and increases clearcoat during rain", () => {
    const wet = resolveWetSurfaceParameters(0.8, 0.05, "rain", 1);
    expect(wet.roughness).toBeCloseTo(0.18);
    expect(wet.clearcoat).toBeCloseTo(0.72);
    expect(wet.clearcoatRoughness).toBeCloseTo(0.08);
  });

  it("clamps weather intensity", () => {
    const wet = resolveWetSurfaceParameters(0.8, 0.05, "rain", 5);
    expect(wet.roughness).toBeCloseTo(0.18);
  });

  it("does not make fog or cloudy weather wet", () => {
    expect(resolveWetSurfaceParameters(0.7, 0.2, "fog", 1).roughness).toBe(0.7);
    expect(resolveWetSurfaceParameters(0.7, 0.2, "cloudy", 1).clearcoat).toBe(0.2);
  });

  it("falls back to a dry surface for non-finite rain intensity", () => {
    expect(resolveWetSurfaceParameters(0.8, 0.1, "rain", Number.NaN)).toEqual({
      roughness: 0.8,
      clearcoat: 0.1,
      clearcoatRoughness: 0.32,
    });
    expect(resolveWetSurfaceParameters(0.8, 0.1, "rain", Number.POSITIVE_INFINITY)).toEqual({
      roughness: 0.8,
      clearcoat: 0.1,
      clearcoatRoughness: 0.32,
    });
  });
});
