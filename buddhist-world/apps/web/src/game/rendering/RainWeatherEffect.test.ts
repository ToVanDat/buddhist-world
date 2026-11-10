import { describe, expect, it } from "vitest";
import { getRainParticleBudget } from "./RainWeatherEffect";

describe("weather particle quality budgets", () => {
  it("reduces rain particle count for lower quality tiers", () => {
    expect(getRainParticleBudget("ULTRA")).toBeGreaterThan(getRainParticleBudget("HIGH"));
    expect(getRainParticleBudget("HIGH")).toBeGreaterThan(getRainParticleBudget("MEDIUM"));
    expect(getRainParticleBudget("MEDIUM")).toBeGreaterThan(getRainParticleBudget("LOW"));
  });
  it("keeps mobile particle budget bounded", () => {
    expect(getRainParticleBudget("MOBILE")).toBeLessThanOrEqual(120);
  });
});
