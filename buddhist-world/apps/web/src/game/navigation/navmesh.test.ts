import { describe, expect, it } from "vitest";
import { findNavmeshRoute, type NavmeshData } from "./navmesh";

const connectedMesh: NavmeshData = {
  version: 1,
  regionId: "temple_complex",
  coordinateSystem: "Y_UP_METERS",
  maxSlopeDegrees: 45,
  vertices: [
    [0, 0, 0], [2, 0, 0], [0, 0, 2],
    [2, 0, 2], [4, 0, 0], [4, 0, 2],
  ],
  polygons: [
    { id: 0, vertices: [0, 2, 1], neighbors: [1] },
    { id: 1, vertices: [1, 2, 3], neighbors: [0, 2] },
    { id: 2, vertices: [1, 3, 4], neighbors: [1] },
  ],
};

describe("findNavmeshRoute", () => {
  it("finds a connected route and returns ordered polygon ids", () => {
    const route = findNavmeshRoute(connectedMesh, [0.2, 0, 0.2], [3.7, 0, 0.2]);
    expect(route).not.toBeNull();
    expect(route?.polygonIds).toEqual([0, 1, 2]);
    expect(route?.points[0]).toEqual([0.2, 0, 0.2]);
    expect(route?.points.at(-1)).toEqual([3.7, 0, 0.2]);
    expect(route?.length).toBeGreaterThan(0);
  });

  it("returns null when the target polygon is disconnected", () => {
    const disconnected: NavmeshData = {
      ...connectedMesh,
      polygons: connectedMesh.polygons.map((polygon) => ({ ...polygon, neighbors: [] })),
    };
    expect(findNavmeshRoute(disconnected, [0.2, 0, 0.2], [3.7, 0, 0.2])).toBeNull();
  });

  it("rejects malformed polygon references", () => {
    const malformed: NavmeshData = {
      ...connectedMesh,
      polygons: connectedMesh.polygons.map((polygon) => polygon.id === 1
        ? { ...polygon, vertices: [1, 99, 2] as [number, number, number] }
        : polygon),
    };
    expect(findNavmeshRoute(malformed, [0.2, 0, 0.2], [3.7, 0, 0.2])).toBeNull();
  });
});
