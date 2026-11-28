import { describe, expect, it } from "vitest";
import { resolveVolumetricFogParameters } from "./volumetricFog";

describe("volumetric fog quality budget", () => {
  it("uses 16 and 8 raymarch steps only on ultra and high", () => {
    expect(resolveVolumetricFogParameters("ULTRA", "fog", 1).steps).toBe(16);
    expect(resolveVolumetricFogParameters("HIGH", "fog", 1).steps).toBe(8);
    for (const quality of ["MEDIUM", "LOW", "MOBILE"] as const) {
      expect(resolveVolumetricFogParameters(quality, "fog", 1).enabled).toBe(false);
    }
  });

  it("only activates for fog, rain and cloudy weather with non-trivial intensity", () => {
    expect(resolveVolumetricFogParameters("ULTRA", "clear", 1).enabled).toBe(false);
    expect(resolveVolumetricFogParameters("ULTRA", "fog", 0).enabled).toBe(false);
    expect(resolveVolumetricFogParameters("ULTRA", "rain", 0.5).enabled).toBe(true);
    expect(resolveVolumetricFogParameters("HIGH", "cloudy", 0.8).enabled).toBe(true);
  });

  it("clamps invalid and out-of-range intensity", () => {
    expect(resolveVolumetricFogParameters("ULTRA", "fog", 9).density).toBeCloseTo(0.032);
    expect(resolveVolumetricFogParameters("ULTRA", "fog", Number.NaN).density).toBe(0);
  });
});
