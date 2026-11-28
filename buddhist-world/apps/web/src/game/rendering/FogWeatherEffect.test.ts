import { describe, expect, it } from "vitest";
import { getFogParticleBudget, resolveFogIntensity } from "./FogWeatherEffect";

describe("fog particle quality budgets", () => {
  it("reduces particle counts for lower quality tiers", () => {
    expect(getFogParticleBudget("ULTRA")).toBeGreaterThan(getFogParticleBudget("HIGH"));
    expect(getFogParticleBudget("HIGH")).toBeGreaterThan(getFogParticleBudget("MEDIUM"));
    expect(getFogParticleBudget("MEDIUM")).toBeGreaterThan(getFogParticleBudget("LOW"));
    expect(getFogParticleBudget("LOW")).toBeGreaterThan(getFogParticleBudget("MOBILE"));
  });

  it("clamps fog intensity and safely ignores invalid values", () => {
    expect(resolveFogIntensity("fog", 0.6)).toBe(0.6);
    expect(resolveFogIntensity("fog", 4)).toBe(1);
    expect(resolveFogIntensity("fog", Number.NaN)).toBe(0);
    expect(resolveFogIntensity("fog", Number.POSITIVE_INFINITY)).toBe(0);
    expect(resolveFogIntensity("rain", 1)).toBe(0);
  });

  it("keeps mobile fog particle count bounded", () => {
    expect(getFogParticleBudget("MOBILE")).toBeLessThanOrEqual(32);
  });
});
