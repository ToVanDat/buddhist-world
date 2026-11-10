import { describe, expect, it } from "vitest";
import { LIGHTING_QUALITY_PROFILES, resolveLightingQuality } from "./LightingProfiles";

describe("lighting quality budgets", () => {
  it("monotonically reduces shadow resolution and local lights", () => {
    expect(resolveLightingQuality("ULTRA").shadowMapSize).toBeGreaterThan(resolveLightingQuality("HIGH").shadowMapSize);
    expect(resolveLightingQuality("HIGH").shadowMapSize).toBeGreaterThan(resolveLightingQuality("MEDIUM").shadowMapSize);
    expect(resolveLightingQuality("MEDIUM").maxLocalLights).toBeGreaterThan(resolveLightingQuality("LOW").maxLocalLights);
  });

  it("disables expensive reflection and post-processing on low and mobile", () => {
    for (const quality of ["LOW", "MOBILE"] as const) {
      const budget = resolveLightingQuality(quality);
      expect(budget.reflections).toBe(false);
      expect(budget.reflectionResolution).toBe(0);
      expect(budget.cinematicEffects).toBe(false);
      expect(budget.shadows).toBe(false);
    }
  });

  it("keeps mobile and low post-processing budgets at zero", () => {
    expect(LIGHTING_QUALITY_PROFILES.MOBILE.bloomStrength).toBe(0);
    expect(LIGHTING_QUALITY_PROFILES.LOW.postProcessPixelRatio).toBeLessThan(1);
  });
});
