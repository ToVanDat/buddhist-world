import { describe, it, expect } from "vitest";
import { REGIONS } from "@bw/shared";
import { isPositionInBounds, isWalkablePosition, isWalkableSegment, normalizeYaw, resolveSavedLocation, validateMove } from "./movement.js";
import type { RegionNavmesh } from "../modules/world/navmeshPathfinding.js";

const region = REGIONS.temple_complex!;
const navmesh: RegionNavmesh = {
  version: 1,
  regionId: "temple_complex",
  coordinateSystem: "Y_UP_METERS",
  vertices: [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]],
  polygons: [
    { id: 0, vertices: [0, 1, 2], neighbors: [1] },
    { id: 1, vertices: [0, 2, 3], neighbors: [0] },
  ],
};

describe("validateMove", () => {
  it("chấp nhận bước đi bình thường", () => {
    expect(validateMove(region, [0, 1, 0], [0.5, 1, 0], 0.1).ok).toBe(true);
  });
  it("từ chối teleport", () => {
    const v = validateMove(region, [0, 1, 0], [50, 1, 0], 0.1);
    expect(v.ok).toBe(false);
    if (!v.ok) { expect(v.reason).toBe("too_fast"); expect(v.position).toEqual([0, 1, 0]); }
  });
  it("từ chối ra ngoài ranh giới region", () => {
    const v = validateMove(region, [119, 1, 0], [121, 1, 0], 1);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("out_of_bounds");
  });
  it("không cho gian lận bằng dt rất lớn", () => {
    expect(validateMove(region, [0, 1, 0], [50, 1, 0], 9999).ok).toBe(false);
  });
  it("fails closed for non-finite, zero, or negative movement time deltas", () => {
    for (const dt of [Number.NaN, Number.POSITIVE_INFINITY, 0, -0.1]) {
      expect(validateMove(region, [0, 1, 0], [20, 1, 0], dt)).toMatchObject({
        ok: false, reason: "too_fast", position: [0, 1, 0],
      });
    }
  });
  it("rejects persisted positions containing NaN or infinity", () => {
    expect(isPositionInBounds(region, [Number.NaN, 1, 0])).toBe(false);
    expect(isPositionInBounds(region, [0, Number.POSITIVE_INFINITY, 0])).toBe(false);
  });
  it("accepts a finite saved position inside the region bounds", () => {
    expect(isPositionInBounds(region, [0, 1, 0])).toBe(true);
  });
});

describe("server navmesh collision", () => {
  it("accepts positions projected onto a walkable triangle within player-root height tolerance", () => {
    expect(isWalkablePosition(navmesh, [5, 1.2, 5])).toBe(true);
  });
  it("rejects positions outside every walkable triangle", () => {
    expect(isWalkablePosition(navmesh, [11, 1.2, 5])).toBe(false);
  });
  it("rejects positions below the walkable surface", () => {
    expect(isWalkablePosition(navmesh, [5, -0.5, 5])).toBe(false);
  });
  it("allows a bounded jump above the walkable surface", () => {
    expect(isWalkablePosition(navmesh, [5, 2.8, 5], 3.0)).toBe(true);
    expect(isWalkablePosition(navmesh, [5, 3.2, 5], 3.0)).toBe(false);
  });
  it("checks the full movement segment rather than only its destination", () => {
    expect(isWalkableSegment(navmesh, [1, 1.2, 1], [9, 1.2, 9])).toBe(true);
    expect(isWalkableSegment(navmesh, [1, 1.2, 1], [11, 1.2, 5])).toBe(false);
  });
  it("corrects a speed-valid move that leaves the server navmesh", () => {
    const verdict = validateMove(region, [1, 1.2, 1], [11, 1.2, 5], 1, navmesh);
    expect(verdict).toMatchObject({ ok: false, reason: "blocked", position: [1, 1.2, 1] });
  });
});

describe("normalizeYaw", () => {
  it("keeps ordinary angles unchanged", () => expect(normalizeYaw(0.75)).toBeCloseTo(0.75));
  it("wraps angles into the -PI to PI interval", () => {
    expect(normalizeYaw(Math.PI * 3)).toBeCloseTo(-Math.PI);
    expect(normalizeYaw(-Math.PI * 3)).toBeCloseTo(-Math.PI);
  });
  it("uses a safe fallback for non-finite values", () => {
    expect(normalizeYaw(Number.NaN, 1.25)).toBeCloseTo(1.25);
  });
});

describe("resolveSavedLocation", () => {
  it("restores a saved checkpoint position and its facing direction", () => {
    const spawn = region.spawns[0]!;
    expect(resolveSavedLocation(region, {
      regionId: region.id, spawnId: spawn.id, position: [2, 1, 39], yaw: 0.75,
    })).toEqual({ position: [2, 1, 39], yaw: 0.75 });
  });
  it("normalizes an out-of-range persisted yaw", () => {
    const spawn = region.spawns[0]!;
    const restored = resolveSavedLocation(region, {
      regionId: region.id, spawnId: spawn.id, position: [2, 1, 19], yaw: Math.PI * 3,
    });
    expect(restored?.yaw).toBeCloseTo(-Math.PI);
  });
  it("rejects a saved checkpoint from another region", () => {
    expect(resolveSavedLocation(region, {
      regionId: "unknown", spawnId: region.defaultSpawn, position: [0, 1, 0],
    })).toBeNull();
  });
  it("rejects an unknown checkpoint id", () => {
    expect(resolveSavedLocation(region, {
      regionId: region.id, spawnId: "not-a-checkpoint", position: [0, 1, 0],
    })).toBeNull();
  });
  it("rejects non-finite or out-of-bounds persisted coordinates", () => {
    expect(resolveSavedLocation(region, {
      regionId: region.id, spawnId: region.defaultSpawn, position: [Number.NaN, 1, 0],
    })).toBeNull();
    expect(resolveSavedLocation(region, {
      regionId: region.id, spawnId: region.defaultSpawn, position: [999, 1, 0],
    })).toBeNull();
  });
});
