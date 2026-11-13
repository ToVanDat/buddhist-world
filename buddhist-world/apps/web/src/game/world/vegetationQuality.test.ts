import { describe, expect, it } from "vitest";
import { resolveGrassDensity, resolveGrassVisibleDistance, TREE_LOD_DISTANCES } from "./vegetationQuality";

describe("vegetation quality budgets", () => {
  it("reduces grass density monotonically for lower quality profiles", () => {
    expect(resolveGrassDensity("ULTRA")).toBe(1);
    expect(resolveGrassDensity("HIGH")).toBeLessThan(resolveGrassDensity("ULTRA"));
    expect(resolveGrassDensity("MEDIUM")).toBeLessThan(resolveGrassDensity("HIGH"));
    expect(resolveGrassDensity("LOW")).toBeLessThan(resolveGrassDensity("MEDIUM"));
    expect(resolveGrassDensity("MOBILE")).toBe(resolveGrassDensity("LOW"));
  });

  it("reduces grass visibility distance for lower quality profiles", () => {
    expect(resolveGrassVisibleDistance("ULTRA")).toBe(118);
    expect(resolveGrassVisibleDistance("HIGH")).toBeLessThan(resolveGrassVisibleDistance("ULTRA"));
    expect(resolveGrassVisibleDistance("MEDIUM")).toBeLessThan(resolveGrassVisibleDistance("HIGH"));
    expect(resolveGrassVisibleDistance("LOW")).toBeLessThan(resolveGrassVisibleDistance("MEDIUM"));
    expect(resolveGrassVisibleDistance("MOBILE")).toBe(resolveGrassVisibleDistance("LOW"));
  });

  it("uses increasing tree LOD/cull distances and lowers them on constrained profiles", () => {
    for (const [quality, distances] of Object.entries(TREE_LOD_DISTANCES)) {
      expect(distances[0]).toBeGreaterThan(0);
      expect(distances[1]).toBeGreaterThan(distances[0]);
      expect(distances[2]).toBeGreaterThan(distances[1]);
      expect(quality).toBeTruthy();
    }
    expect(TREE_LOD_DISTANCES.ULTRA[2]).toBeGreaterThan(TREE_LOD_DISTANCES.HIGH[2]);
    expect(TREE_LOD_DISTANCES.HIGH[2]).toBeGreaterThan(TREE_LOD_DISTANCES.MEDIUM[2]);
    expect(TREE_LOD_DISTANCES.MEDIUM[2]).toBeGreaterThan(TREE_LOD_DISTANCES.LOW[2]);
  });
});
