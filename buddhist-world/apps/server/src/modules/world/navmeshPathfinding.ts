import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getRegion, type Vec3 } from "@bw/shared";

export interface NavmeshPolygon { id: number; vertices: [number, number, number]; neighbors: number[] }
export interface RegionNavmesh {
  version: 1;
  regionId: string;
  coordinateSystem: "Y_UP_METERS";
  vertices: Vec3[];
  polygons: NavmeshPolygon[];
}
const moduleDir = dirname(fileURLToPath(import.meta.url));

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

/** Load the exact navmesh URL declared by the shared region manifest. */
export function loadRegionNavmesh(regionId: string): RegionNavmesh | null {
  const region = getRegion(regionId);
  if (!region?.navmesh) return null;
  const relative = region.navmesh.replace(/^\/+/, "");
  const filePath = resolve(moduleDir, "../../../../web/public", relative);
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8")) as Partial<RegionNavmesh>;
    if (value.version !== 1 || value.regionId !== regionId || value.coordinateSystem !== "Y_UP_METERS" ||
        !Array.isArray(value.vertices) || !value.vertices.length || !value.vertices.every(isVec3) ||
        !Array.isArray(value.polygons) || !value.polygons.length) {
      throw new Error(`Navmesh manifest mismatch or invalid geometry for region ${regionId}`);
    }
    for (let index = 0; index < value.polygons.length; index += 1) {
      const polygon = value.polygons[index]!;
      if (polygon.id !== index || !Array.isArray(polygon.vertices) || polygon.vertices.length !== 3 ||
          polygon.vertices.some((vertex) => !Number.isInteger(vertex) || vertex < 0 || vertex >= value.vertices!.length) ||
          new Set(polygon.vertices).size !== 3 ||
          triangleArea(value.vertices[polygon.vertices[0]]!, value.vertices[polygon.vertices[1]]!, value.vertices[polygon.vertices[2]]!) <= 1e-8 ||
          !Array.isArray(polygon.neighbors) ||
          polygon.neighbors.some((neighbor) => !Number.isInteger(neighbor) || neighbor < 0 || neighbor >= value.polygons!.length || neighbor === index)) {
        throw new Error(`Invalid navmesh polygon ${index} in region ${regionId}`);
      }
      for (const neighbor of polygon.neighbors) {
        if (!value.polygons[neighbor]?.neighbors?.includes(index)) {
          throw new Error(`Non-reciprocal navmesh adjacency ${index}<->${neighbor} in region ${regionId}`);
        }
      }
    }
    return value as RegionNavmesh;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function centroid(mesh: RegionNavmesh, polygonId: number): Vec3 {
  const polygon = mesh.polygons[polygonId]!;
  const a = mesh.vertices[polygon.vertices[0]]!;
  const b = mesh.vertices[polygon.vertices[1]]!;
  const c = mesh.vertices[polygon.vertices[2]]!;
  return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
}
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function subtract(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function addScaled(a: Vec3, b: Vec3, scale: number): Vec3 {
  return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale];
}
function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = subtract(b, a), ac = subtract(c, a);
  const cross: Vec3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  return Math.hypot(cross[0], cross[1], cross[2]) / 2;
}

/** Closest point on a non-degenerate 3D triangle (Ericson region tests). */
export function closestPointOnTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab = subtract(b, a), ac = subtract(c, a), ap = subtract(point, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [...a];
  const bp = subtract(point, b);
  const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [...b];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return addScaled(a, ab, d1 / (d1 - d3));
  const cp = subtract(point, c);
  const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [...c];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return addScaled(a, ac, d2 / (d2 - d6));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const edge = subtract(c, b);
    return addScaled(b, edge, (d4 - d3) / ((d4 - d3) + (d5 - d6)));
  }
  const denominator = 1 / (va + vb + vc);
  return addScaled(addScaled(a, ab, vb * denominator), ac, vc * denominator);
}

interface PolygonProjection { id: number; point: Vec3; distance: number }
function nearestPolygon(mesh: RegionNavmesh, point: Vec3, maxSnapDistance: number): PolygonProjection | null {
  let best: PolygonProjection | null = null;
  for (const polygon of mesh.polygons) {
    const a = mesh.vertices[polygon.vertices[0]];
    const b = mesh.vertices[polygon.vertices[1]];
    const c = mesh.vertices[polygon.vertices[2]];
    if (!a || !b || !c) continue;
    const projected = closestPointOnTriangle(point, a, b, c);
    const candidateDistance = distance(point, projected);
    if (!best || candidateDistance < best.distance) {
      best = { id: polygon.id, point: projected, distance: candidateDistance };
    }
  }
  return best && best.distance <= maxSnapDistance ? best : null;
}

/**
 * Checks the whole movement segment against walkable triangles, not only its
 * endpoints. Missing navmesh data is handled by the caller's documented
 * bounds-and-speed fallback; a supplied but invalid/disconnected mesh rejects.
 */
export function isSegmentWalkable(
  mesh: RegionNavmesh,
  start: Vec3,
  end: Vec3,
  maxSurfaceDistance = 1.5,
  maxSampleSpacing = 0.2,
): boolean {
  if (!isVec3(start) || !isVec3(end) || !Number.isFinite(maxSurfaceDistance) ||
      maxSurfaceDistance < 0 || !Number.isFinite(maxSampleSpacing) || maxSampleSpacing <= 0) return false;
  const length = distance(start, end);
  const steps = Math.max(1, Math.ceil(length / maxSampleSpacing));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const sample: Vec3 = [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ];
    const projection = nearestPolygon(mesh, sample, maxSurfaceDistance);
    if (!projection) return false;
    const horizontalOffset = Math.hypot(sample[0] - projection.point[0], sample[2] - projection.point[2]);
    const verticalOffset = Math.abs(sample[1] - projection.point[1]);
    // Player transforms may be above the floor, but must remain horizontally
    // over a walkable triangle. A large 3D snap radius alone would bridge gaps.
    if (horizontalOffset > 0.35 || verticalOffset > maxSurfaceDistance) return false;
  }
  return true;
}

/** A* over triangle adjacency; output is a server-side Y-up waypoint polyline. */
export function findNavmeshPath(
  mesh: RegionNavmesh,
  start: Vec3,
  end: Vec3,
  maxSnapDistance = 8,
): Vec3[] | null {
  if (!isVec3(start) || !isVec3(end) || !Number.isFinite(maxSnapDistance) || maxSnapDistance <= 0) return null;
  const startProjection = nearestPolygon(mesh, start, maxSnapDistance);
  const endProjection = nearestPolygon(mesh, end, maxSnapDistance);
  if (!startProjection || !endProjection) return null;
  const startId = startProjection.id;
  const endId = endProjection.id;
  if (startId === endId) return [startProjection.point, endProjection.point];
  const open = new Set<number>([startId]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startId, 0]]);
  const fScore = new Map<number, number>([[startId, distance(centroid(mesh, startId), centroid(mesh, endId))]]);
  let expanded = 0;
  const maxExpanded = Math.min(mesh.polygons.length, 20_000);
  while (open.size && expanded < maxExpanded) {
    expanded += 1;
    let current = -1;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of open) {
      const score = fScore.get(candidate) ?? Number.POSITIVE_INFINITY;
      if (score < best) { best = score; current = candidate; }
    }
    if (current === endId) {
      const chain = [current];
      while (cameFrom.has(chain[0]!)) chain.unshift(cameFrom.get(chain[0]!)!);
      // Keep a waypoint inside every triangle in the A* corridor. A direct
      // start-to-end segment (or a smoothed centroid shortcut) can cut across
      // non-walkable space even when the polygon adjacency itself is valid.
      const points: Vec3[] = [startProjection.point];
      for (const id of chain) points.push(centroid(mesh, id));
      points.push(endProjection.point);
      return points;
    }
    open.delete(current);
    const currentCenter = centroid(mesh, current);
    for (const neighbor of mesh.polygons[current]!.neighbors) {
      const tentative = (gScore.get(current) ?? Number.POSITIVE_INFINITY) +
        distance(currentCenter, centroid(mesh, neighbor));
      if (tentative >= (gScore.get(neighbor) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighbor, current);
      gScore.set(neighbor, tentative);
      fScore.set(neighbor, tentative + distance(centroid(mesh, neighbor), centroid(mesh, endId)));
      open.add(neighbor);
    }
  }
  return null;
}
