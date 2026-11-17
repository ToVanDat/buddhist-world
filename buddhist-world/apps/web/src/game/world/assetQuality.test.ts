import { describe, expect, it } from "vitest";
import { resolveArchitectureSegments, resolveAssetLodLevel, resolveInstanceMatrixUpdateInterval, resolveMountainLodDistances, resolveMountainSegments, resolveWaterfallMistCount } from "./assetQuality";

describe("asset quality budgets", () => {
  it("reduces architecture tessellation for lower quality profiles", () => {
    const ultra = resolveArchitectureSegments("ULTRA");
    const high = resolveArchitectureSegments("HIGH");
    const medium = resolveArchitectureSegments("MEDIUM");
    const low = resolveArchitectureSegments("LOW");
    expect(ultra[0] * ultra[1]).toBeGreaterThan(high[0] * high[1]);
    expect(high[0] * high[1]).toBeGreaterThan(medium[0] * medium[1]);
    expect(medium[0] * medium[1]).toBeGreaterThan(low[0] * low[1]);
  });

  it("uses progressively cheaper mountain geometry and earlier culling on lower tiers", () => {
    const ultra = resolveMountainSegments("ULTRA");
    const low = resolveMountainSegments("LOW");
    expect(ultra[0]).toBeGreaterThan(low[0]);
    expect(ultra[1]).toBeGreaterThan(low[1]);
    expect(ultra[2]).toBeGreaterThan(low[2]);
    expect(resolveMountainLodDistances("ULTRA")[2]).toBeGreaterThan(resolveMountainLodDistances("LOW")[2]);
  });

  it("reduces CPU instance-matrix refresh frequency on lower quality profiles", () => {
    expect(resolveInstanceMatrixUpdateInterval("ULTRA")).toBe(1 / 30);
    expect(resolveInstanceMatrixUpdateInterval("HIGH")).toBe(1 / 30);
    expect(resolveInstanceMatrixUpdateInterval("MEDIUM")).toBe(1 / 24);
    expect(resolveInstanceMatrixUpdateInterval("LOW")).toBe(1 / 15);
    expect(resolveInstanceMatrixUpdateInterval("MOBILE")).toBe(1 / 15);
  });

  it("selects only the needed LOD and applies hysteresis around boundaries", () => {
    const levels = [
      { distance: 0 },
      { distance: 50, hysteresis: 0.1 },
      { distance: 100, hysteresis: 0.1 },
    ] as const;
    expect(resolveAssetLodLevel(40, 0, levels, 180)).toBe(0);
    expect(resolveAssetLodLevel(56, 0, levels, 180)).toBe(1);
    expect(resolveAssetLodLevel(48, 1, levels, 180)).toBe(1);
    expect(resolveAssetLodLevel(44, 1, levels, 180)).toBe(0);
    expect(resolveAssetLodLevel(120, 1, levels, 180)).toBe(2);
  });

  it("culls distant assets and restores the far LOD only after hysteresis", () => {
    const levels = [{ distance: 0 }, { distance: 50 }, { distance: 100 }] as const;
    expect(resolveAssetLodLevel(190, 2, levels, 180)).toBe(-1);
    expect(resolveAssetLodLevel(175, -1, levels, 180)).toBe(-1);
    expect(resolveAssetLodLevel(160, -1, levels, 180)).toBe(2);
  });

  it("scales waterfall mist particles down on lower quality profiles", () => {
    expect(resolveWaterfallMistCount("ULTRA")).toBe(120);
    expect(resolveWaterfallMistCount("HIGH")).toBeLessThan(120);
    expect(resolveWaterfallMistCount("MEDIUM")).toBeLessThan(resolveWaterfallMistCount("HIGH"));
    expect(resolveWaterfallMistCount("LOW")).toBeLessThan(resolveWaterfallMistCount("MEDIUM"));
    expect(resolveWaterfallMistCount("MOBILE")).toBe(resolveWaterfallMistCount("LOW"));
  });
});