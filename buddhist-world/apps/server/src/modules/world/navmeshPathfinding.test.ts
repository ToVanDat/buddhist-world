import { describe, expect, it } from "vitest";
import { findNavmeshPath, isSegmentWalkable, resolveNavmeshFilePath, type RegionNavmesh } from "./navmeshPathfinding.js";

const mesh: RegionNavmesh = {
  version: 1, regionId: "test_region", coordinateSystem: "Y_UP_METERS",
  vertices: [[0,0,0],[1,0,0],[1,0,1],[0,0,1],[2,0,0],[2,0,1]],
  polygons: [
    { id: 0, vertices: [0,2,1], neighbors: [1,2] },
    { id: 1, vertices: [0,3,2], neighbors: [0] },
    { id: 2, vertices: [1,2,4], neighbors: [0,3] },
    { id: 3, vertices: [4,2,5], neighbors: [2] },
  ],
};

describe("navmesh asset path resolution", () => {
  it("resolves declared navmesh assets under the public root", () => {
    expect(resolveNavmeshFilePath("/assets/navmesh/temple_complex.json")).toContain("assets");
    expect(resolveNavmeshFilePath("/assets/navmesh/temple_complex.json")).toMatch(/temple_complex\.json$/);
  });

  it.each([
    "/assets/navmesh/../../secrets.json",
    "/assets/navmesh/%2e%2e/secrets.json",
    "/assets/navmesh\\evil.json",
    "/assets/navmesh/file.json?download=1",
    "//external.example/navmesh.json",
  ])("rejects unsafe navmesh URI %s", (uri) => {
    expect(() => resolveNavmeshFilePath(uri)).toThrow();
  });
});

describe("server navmesh A* pathfinding", () => {
  it("returns a connected route between adjacent walkable regions", () => {
    const route = findNavmeshPath(mesh, [0.2,0,0.2], [1.8,0,0.8], 2);
    expect(route).not.toBeNull();
    expect(route?.[0]).toEqual([0.2,0,0.2]);
    expect(route?.at(-1)).toEqual([1.8,0,0.8]);
    expect(route).toHaveLength(2);
    expect(isSegmentWalkable(mesh, route![0]!, route![1]!)).toBe(true);
  });
  it("returns null for disconnected polygons", () => {
    const disconnected = { ...mesh, polygons: mesh.polygons.map((p) => ({ ...p, neighbors: [] })) };
    expect(findNavmeshPath(disconnected, [0.2,0,0.2], [1.8,0,0.8], 2)).toBeNull();
  });
  it("rejects a surface steeper than the authored maximum slope", () => {
    const steep: RegionNavmesh = {
      version: 1, regionId: "steep", coordinateSystem: "Y_UP_METERS", maxSlopeDegrees: 30,
      vertices: [[0,0,0],[0,1,1],[1,0,0]],
      polygons: [{ id: 0, vertices: [0,1,2], neighbors: [] }],
    };
    expect(isSegmentWalkable(steep, [0.1,0.1,0.1], [0.2,0.1,0.2])).toBe(false);
  });

  it("rejects points too far from walkable geometry", () => {
    expect(findNavmeshPath(mesh, [100,0,100], [1,0,1], 2)).toBeNull();
  });
});


describe("navmesh point projection and movement segment validation", () => {
  it("projects a point near a triangle edge instead of ranking by centroid distance", () => {
    const singleTriangle: RegionNavmesh = {
      version: 1, regionId: "projection", coordinateSystem: "Y_UP_METERS",
      vertices: [[0,0,0],[2,0,0],[0,0,2]],
      polygons: [{ id: 0, vertices: [0,1,2], neighbors: [] }],
    };
    const route = findNavmeshPath(singleTriangle, [1.1,0,1.1], [0.2,0,0.2], 0.2);
    expect(route).not.toBeNull();
    expect(route?.[0]).toEqual([1,0,1]);
  });

  it("accepts a zero-length segment when its point is on a walkable surface", () => {
    expect(isSegmentWalkable(mesh, [0.2,0,0.2], [0.2,0,0.2])).toBe(true);
  });

  it("accepts movement over adjacent walkable triangles", () => {
    expect(isSegmentWalkable(mesh, [0.1,0,0.1], [1.8,0,0.8])).toBe(true);
  });

  it("rejects pathological segment lengths and sample spacing before iterating", () => {
    expect(isSegmentWalkable(mesh, [0.1,0,0.1], [1000,0,0.1])).toBe(false);
    expect(isSegmentWalkable(mesh, [0.1,0,0.1], [0.8,0,0.8], 1.5, Number.MIN_VALUE)).toBe(false);
  });

  it("rejects movement segments crossing a gap between walkable surfaces", () => {
    const separated: RegionNavmesh = {
      version: 1, regionId: "gap", coordinateSystem: "Y_UP_METERS",
      vertices: [[0,0,0],[1,0,0],[0,0,1],[3,0,0],[4,0,0],[3,0,1]],
      polygons: [
        { id: 0, vertices: [0,1,2], neighbors: [] },
        { id: 1, vertices: [3,4,5], neighbors: [] },
      ],
    };
    expect(isSegmentWalkable(separated, [0.1,0,0.1], [3.1,0,0.1])).toBe(false);
  });
});


describe("navmesh corridor validation", () => {
  it("rejects invalid polygon indices and non-reciprocal adjacency safely", () => {
    const invalidIndex: RegionNavmesh = {
      ...mesh,
      polygons: [{ id: 0, vertices: [0, 1, 999], neighbors: [] }],
    };
    const invalidAdjacency: RegionNavmesh = {
      ...mesh,
      polygons: mesh.polygons.map((polygon, index) => ({
        ...polygon,
        neighbors: index === 0 ? [1] : polygon.neighbors.filter((neighbor) => neighbor !== 0),
      })),
    };
    expect(findNavmeshPath(invalidIndex, [0.2,0,0.2], [0.8,0,0.8])).toBeNull();
    expect(findNavmeshPath(invalidAdjacency, [0.2,0,0.2], [0.8,0,0.8])).toBeNull();
  });

  it("returns a smoothed route through a connected narrow corridor", () => {
    const route = findNavmeshPath(mesh, [0.2,0,0.2], [1.8,0,0.8], 2);
    expect(route).toEqual([[0.2,0,0.2],[1.8,0,0.8]]);
  });
});
