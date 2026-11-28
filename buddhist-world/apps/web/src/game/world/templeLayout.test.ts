import { describe, expect, it } from "vitest";
import { REGIONS, TEMPLE_LAYOUT, isInsideLotusPondFootprint, validateTempleSpawnSafety } from "@bw/shared";

describe("temple world coordinate manifest", () => {
  it("keeps all region spawns outside the lotus pond and player safety margin", () => {
    expect(validateTempleSpawnSafety(REGIONS.temple_complex!.spawns)).toEqual([]);
    expect(isInsideLotusPondFootprint(TEMPLE_LAYOUT.spawns.lotusPond.position, TEMPLE_LAYOUT.pond.spawnClearance)).toBe(false);
  });
  it("detects a spawn at the pond centre and near its collision boundary", () => {
    expect(isInsideLotusPondFootprint(TEMPLE_LAYOUT.pond.center)).toBe(true);
    expect(isInsideLotusPondFootprint([-18, 1.2, 12], TEMPLE_LAYOUT.pond.spawnClearance)).toBe(true);
  });
  it("uses one footprint for rendered water, collision and spawn validation", () => {
    expect(TEMPLE_LAYOUT.pond.halfExtents).toEqual([7, 7]);
    expect(TEMPLE_LAYOUT.pond.collisionTopY).toBeGreaterThan(0.8);
    expect(TEMPLE_LAYOUT.pond.collisionBottomY).toBeLessThan(0);
    expect(TEMPLE_LAYOUT.pond.waterSurfaceY).toBeGreaterThan(0);
    expect(TEMPLE_LAYOUT.anchors.lotusPond).toEqual(TEMPLE_LAYOUT.pond.center);
  });
});
