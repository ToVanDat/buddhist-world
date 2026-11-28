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

const centroid = (polygon: NavmeshPolygon, vertices: Vec3): Vec3 => {
  const a = vertices[polygon.vertices[0]]!;
  const b = vertices[polygon.vertices[1]]!;
  const c = vertices[polygon.vertices[2]]!;
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
};

function validNavmesh(data: NavmeshData): boolean {
  if (!data || data.version !== 1 || data.coordinateSystem !== "Y_UP_METERS" ||
      !Array.isArray(data.vertices) || !Array.isArray(data.polygons) || !data.polygons.length) return false;
  if (!data.vertices.every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) return false;
  return data.polygons.every((p, i) => p?.id === i && Array.isArray(p.vertices) && p.vertices.length === 3 &&
    p.vertices.every((id) => Number.isInteger(id) && id >= 0 && id < data.vertices.length) &&
    Array.isArray(p.neighbors) && p.neighbors.every((id) => Number.isInteger(id) && id >= 0 && id < data.polygons.length && id !== i));
}

const distance2D = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);

/** A* over authored navmesh triangle adjacency; returns null when the mesh is invalid or disconnected. */
export function findNavmeshRoute(data: NavmeshData, start: Vec3, end: Vec3): NavmeshRoute | null {
  if (!validNavmesh(data) || ![...start, ...end].every(Number.isFinite)) return null;
  const centers = data.polygons.map((polygon) => centroid(polygon, data.vertices));
  const nearest = (point: Vec3) => centers.reduce((best, candidate, index) =>
    distance2D(candidate, point) < distance2D(centers[best]!, point) ? index : best, 0);
  const startId = nearest(start);
  const endId = nearest(end);
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
