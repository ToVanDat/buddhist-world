import { describe, expect, it } from "vitest";
import { getRainParticleBudget, resolveRainIntensity } from "./RainWeatherEffect";

describe("weather particle quality budgets", () => {
  it("reduces rain particle count for lower quality tiers", () => {
    expect(getRainParticleBudget("ULTRA")).toBeGreaterThan(getRainParticleBudget("HIGH"));
    expect(getRainParticleBudget("HIGH")).toBeGreaterThan(getRainParticleBudget("MEDIUM"));
    expect(getRainParticleBudget("MEDIUM")).toBeGreaterThan(getRainParticleBudget("LOW"));
  });
  it("clamps rain intensity and safely ignores invalid values", () => {
    expect(resolveRainIntensity("rain", 0.4)).toBe(0.4);
    expect(resolveRainIntensity("rain", 5)).toBe(1);
    expect(resolveRainIntensity("rain", Number.NaN)).toBe(0);
    expect(resolveRainIntensity("rain", Number.POSITIVE_INFINITY)).toBe(0);
    expect(resolveRainIntensity("fog", 1)).toBe(0);
  });
  it("keeps mobile particle budget bounded", () => {
    expect(getRainParticleBudget("MOBILE")).toBeLessThanOrEqual(120);
  });
});
