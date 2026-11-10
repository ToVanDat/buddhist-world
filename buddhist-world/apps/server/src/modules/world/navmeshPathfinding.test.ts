import { describe, expect, it } from "vitest";
import { findNavmeshPath, type RegionNavmesh } from "./navmeshPathfinding.js";

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

describe("server navmesh A* pathfinding", () => {
  it("returns a connected route between adjacent walkable regions", () => {
    const route = findNavmeshPath(mesh, [0.2,0,0.2], [1.8,0,0.8], 2);
    expect(route).not.toBeNull();
    expect(route?.[0]).toEqual([0.2,0,0.2]);
    expect(route?.at(-1)).toEqual([1.8,0,0.8]);
    expect(route).toHaveLength(5);
    // The route must visit the centroid of every polygon in the A* corridor.
    expect(route?.[1]).toEqual([2/3, 0, 1/3]);
    expect(route?.[2]).toEqual([4/3, 0, 1/3]);
    expect(route?.[3]).toEqual([5/3, 0, 2/3]);
  });
  it("returns null for disconnected polygons", () => {
    const disconnected = { ...mesh, polygons: mesh.polygons.map((p) => ({ ...p, neighbors: [] })) };
    expect(findNavmeshPath(disconnected, [0.2,0,0.2], [1.8,0,0.8], 2)).toBeNull();
  });
  it("rejects points too far from walkable geometry", () => {
    expect(findNavmeshPath(mesh, [100,0,100], [1,0,1], 2)).toBeNull();
  });
});
