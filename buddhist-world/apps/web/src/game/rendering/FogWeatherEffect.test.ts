import { describe, expect, it } from "vitest";
import { getFogParticleBudget } from "./FogWeatherEffect";

describe("fog particle quality budgets", () => {
  it("reduces particle counts for lower quality tiers", () => {
    expect(getFogParticleBudget("ULTRA")).toBeGreaterThan(getFogParticleBudget("HIGH"));
    expect(getFogParticleBudget("HIGH")).toBeGreaterThan(getFogParticleBudget("MEDIUM"));
    expect(getFogParticleBudget("MEDIUM")).toBeGreaterThan(getFogParticleBudget("LOW"));
    expect(getFogParticleBudget("LOW")).toBeGreaterThan(getFogParticleBudget("MOBILE"));
  });

  it("keeps mobile fog particle count bounded", () => {
    expect(getFogParticleBudget("MOBILE")).toBeLessThanOrEqual(32);
  });
});
