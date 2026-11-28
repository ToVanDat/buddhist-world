import { describe, expect, it } from "vitest";
import { resolveSmokeParticleCount } from "../world/assetQuality";

describe("ambient particle budgets", () => {
  it("scales smoke emitters down for constrained quality tiers", () => {
    expect(resolveSmokeParticleCount(24, "ULTRA")).toBe(24);
    expect(resolveSmokeParticleCount(24, "HIGH")).toBe(20);
    expect(resolveSmokeParticleCount(24, "MEDIUM")).toBe(17);
    expect(resolveSmokeParticleCount(24, "LOW")).toBe(12);
    expect(resolveSmokeParticleCount(24, "MOBILE")).toBe(8);
  });

  it("clamps invalid and oversized requests to a safe range", () => {
    expect(resolveSmokeParticleCount(1000, "ULTRA")).toBe(48);
    expect(resolveSmokeParticleCount(-4, "ULTRA")).toBe(1);
    expect(resolveSmokeParticleCount(Number.NaN, "HIGH")).toBe(15);
  });
});
