import { describe, expect, it } from "vitest";
import { findNavmeshRoute, isValidNavmeshData, type NavmeshData } from "./navmesh";

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

describe("navmesh validation and routing", () => {
  it("accepts a valid upward-facing connected walkable mesh", () => {
    expect(isValidNavmeshData(connectedMesh)).toBe(true);
  });

  it("finds a connected route and returns ordered polygon ids", () => {
    const route = findNavmeshRoute(connectedMesh, [0.2, 0, 0.2], [3.7, 0, 0.2]);
    expect(route).not.toBeNull();
    expect(route?.polygonIds).toEqual([0, 1, 2]);
    expect(route?.points[0]).toEqual([0.2, 0, 0.2]);
    expect(route?.points.at(-1)).toEqual([3.7, 0, 0.2]);
    expect(route?.length).toBeGreaterThan(0);
  });

  it("returns null when either endpoint is outside the walkable surface", () => {
    expect(findNavmeshRoute(connectedMesh, [0.2, 0, 5], [3.7, 0, 0.2])).toBeNull();
    expect(findNavmeshRoute(connectedMesh, [0.2, 3, 0.2], [3.7, 0, 0.2])).toBeNull();
    expect(findNavmeshRoute(connectedMesh, [0.2, 0, 0.2], [8, 0, 8])).toBeNull();
  });

  it("returns null when the target polygon is disconnected", () => {
    const disconnected: NavmeshData = {
      ...connectedMesh,
      vertices: [...connectedMesh.vertices, [10, 0, 0], [10, 0, 2], [12, 0, 0], [20, 0, 0], [20, 0, 2], [22, 0, 0]],
      polygons: [
        { id: 0, vertices: [0, 2, 1], neighbors: [] },
        { id: 1, vertices: [6, 8, 7], neighbors: [] },
        { id: 2, vertices: [9, 11, 10], neighbors: [] },
      ],
    };
    expect(findNavmeshRoute(disconnected, [0.2, 0, 0.2], [21.7, 0, 0.2])).toBeNull();
  });

  it("rejects malformed polygon references", () => {
    const malformed: NavmeshData = {
      ...connectedMesh,
      polygons: connectedMesh.polygons.map((polygon) => polygon.id === 1
        ? { ...polygon, vertices: [1, 99, 2] as [number, number, number] }
        : polygon),
    };
    expect(isValidNavmeshData(malformed)).toBe(false);
    expect(findNavmeshRoute(malformed, [0.2, 0, 0.2], [3.7, 0, 0.2])).toBeNull();
  });

  it("rejects degenerate triangles and duplicate vertex indices", () => {
    const degenerate: NavmeshData = {
      ...connectedMesh,
      polygons: connectedMesh.polygons.map((polygon) => polygon.id === 1
        ? { ...polygon, vertices: [1, 1, 3] as [number, number, number] }
        : polygon),
    };
    expect(isValidNavmeshData(degenerate)).toBe(false);
  });

  it("rejects downward-facing and over-slope triangles", () => {
    const downward: NavmeshData = {
      ...connectedMesh,
      polygons: connectedMesh.polygons.map((polygon) => polygon.id === 0
        ? { ...polygon, vertices: [0, 1, 2] as [number, number, number] }
        : polygon),
    };
    const steep: NavmeshData = {
      ...connectedMesh,
      vertices: connectedMesh.vertices.map(([x, y, z]) => [x, y + x * 4, z] as [number, number, number]),
    };
    expect(isValidNavmeshData(downward)).toBe(false);
    expect(isValidNavmeshData(steep)).toBe(false);
  });

  it("rejects neighbor links that do not share an actual edge", () => {
    const gapLink: NavmeshData = {
      ...connectedMesh,
      polygons: [
        { id: 0, vertices: [0, 2, 1], neighbors: [1] },
        { id: 1, vertices: [1, 3, 4], neighbors: [0] },
        { id: 2, vertices: [1, 3, 4], neighbors: [] },
      ],
    };
    expect(isValidNavmeshData(gapLink)).toBe(false);
  });
});
