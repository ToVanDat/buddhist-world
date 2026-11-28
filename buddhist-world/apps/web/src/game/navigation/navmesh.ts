import type { Vec3 } from "@bw/shared";

export interface NavmeshPolygon { id: number; vertices: [number, number, number]; neighbors: number[] }
export interface NavmeshData {
  version: number;
  regionId: string;
  coordinateSystem: "Y_UP_METERS";
  maxSlopeDegrees: number;
  vertices: Vec3[];
  polygons: NavmeshPolygon[];
}
export interface NavmeshRoute { points: Vec3[]; length: number; polygonIds: number[] }

const centroid = (polygon: NavmeshPolygon, vertices: Vec3[]): Vec3 => {
  const a = vertices[polygon.vertices[0]]!;
  const b = vertices[polygon.vertices[1]]!;
  const c = vertices[polygon.vertices[2]]!;
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
};

function triangleGeometryIsWalkable(a: Vec3, b: Vec3, c: Vec3, maxSlopeDegrees: number): boolean {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal: Vec3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const magnitude = Math.hypot(...normal);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-8) return false;
  return normal[1] / magnitude >= Math.cos(maxSlopeDegrees * Math.PI / 180);
}

/** Find the walkable polygon actually containing a world point, not merely its nearest centroid. */
function findContainingPolygon(data: NavmeshData, point: Vec3): number | null {
  const verticalTolerance = 1.25;
  const epsilon = 1e-6;
  let bestId: number | null = null;
  let bestVerticalDistance = Infinity;

  for (const polygon of data.polygons) {
    const a = data.vertices[polygon.vertices[0]]!;
    const b = data.vertices[polygon.vertices[1]]!;
    const c = data.vertices[polygon.vertices[2]]!;
    const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(denominator) <= epsilon) continue;

    const wa = ((b[2] - c[2]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[2] - c[2])) / denominator;
    const wb = ((c[2] - a[2]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[2] - c[2])) / denominator;
    const wc = 1 - wa - wb;
    if (wa < -epsilon || wb < -epsilon || wc < -epsilon) continue;

    const surfaceY = wa * a[1] + wb * b[1] + wc * c[1];
    const verticalDistance = Math.abs(point[1] - surfaceY);
    if (verticalDistance > verticalTolerance || verticalDistance >= bestVerticalDistance) continue;
    bestVerticalDistance = verticalDistance;
    bestId = polygon.id;
  }
  return bestId;
}

export function isValidNavmeshData(data: NavmeshData): boolean {
  if (!data || data.version !== 1 || typeof data.regionId !== "string" || !data.regionId.trim() ||
      data.coordinateSystem !== "Y_UP_METERS" ||
      !Number.isFinite(data.maxSlopeDegrees) || data.maxSlopeDegrees <= 0 || data.maxSlopeDegrees >= 80 ||
      !Array.isArray(data.vertices) || !data.vertices.length || !Array.isArray(data.polygons) || !data.polygons.length) return false;
  if (!data.vertices.every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return false;

  const validPolygons = data.polygons.every((polygon, index) => {
    if (polygon?.id !== index || !Array.isArray(polygon.vertices) || polygon.vertices.length !== 3 ||
        new Set(polygon.vertices).size !== 3 ||
        !polygon.vertices.every((id) => Number.isInteger(id) && id >= 0 && id < data.vertices.length) ||
        !Array.isArray(polygon.neighbors) || new Set(polygon.neighbors).size !== polygon.neighbors.length ||
        !polygon.neighbors.every((id) => Number.isInteger(id) && id >= 0 && id < data.polygons.length && id !== index)) return false;
    const a = data.vertices[polygon.vertices[0]]!;
    const b = data.vertices[polygon.vertices[1]]!;
    const c = data.vertices[polygon.vertices[2]]!;
    return triangleGeometryIsWalkable(a, b, c, data.maxSlopeDegrees);
  });
  if (!validPolygons) return false;

  return data.polygons.every((polygon) => polygon.neighbors.every((neighborId) => {
    const neighbor = data.polygons[neighborId];
    if (!neighbor?.neighbors.includes(polygon.id)) return false;
    const sharedVertices = polygon.vertices.filter((vertexId) => neighbor.vertices.includes(vertexId));
    return sharedVertices.length === 2;
  }));
}

const distance2D = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);

/** A* over authored navmesh triangle adjacency; returns null if either endpoint is off the walkable mesh. */
export function findNavmeshRoute(data: NavmeshData, start: Vec3, end: Vec3): NavmeshRoute | null {
  if (!isValidNavmeshData(data) || ![...start, ...end].every(Number.isFinite)) return null;
  const startId = findContainingPolygon(data, start);
  const endId = findContainingPolygon(data, end);
  if (startId === null || endId === null) return null;
  const centers = data.polygons.map((polygon) => centroid(polygon, data.vertices));
  if (startId === endId) return { points: [start, end], length: distance2D(start, end), polygonIds: [startId] };

  const open = new Set<number>([startId]);
  const cameFrom = new Map<number, number>();
  const g = new Map<number, number>([[startId, 0]]);
  const f = new Map<number, number>([[startId, distance2D(centers[startId]!, centers[endId]!)]]);
  while (open.size) {
    let current = -1;
    let score = Infinity;
    for (const id of open) {
      const value = f.get(id) ?? Infinity;
      if (value < score) { score = value; current = id; }
    }
    if (current === endId) {
      const ids = [current];
      while (cameFrom.has(ids[0]!)) ids.unshift(cameFrom.get(ids[0]!)!);
      const points = [start, ...ids.slice(1, -1).map((id) => centers[id]!), end];
      let length = 0;
      for (let i = 1; i < points.length; i++) length += distance2D(points[i - 1]!, points[i]!);
      return { points, length, polygonIds: ids };
    }
    open.delete(current);
    for (const neighbor of data.polygons[current]!.neighbors) {
      const tentative = (g.get(current) ?? Infinity) + distance2D(centers[current]!, centers[neighbor]!);
      if (tentative >= (g.get(neighbor) ?? Infinity)) continue;
      cameFrom.set(neighbor, current);
      g.set(neighbor, tentative);
      f.set(neighbor, tentative + distance2D(centers[neighbor]!, centers[endId]!));
      open.add(neighbor);
    }
  }
  return null;
}
