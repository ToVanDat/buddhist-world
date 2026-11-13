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
function nearestPolygon(mesh: RegionNavmesh, point: Vec3, maxSnapDistance: number): number | null {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const polygon of mesh.polygons) {
    const candidate = distance(point, centroid(mesh, polygon.id));
    if (candidate < bestDistance) { bestDistance = candidate; best = polygon.id; }
  }
  return best >= 0 && bestDistance <= maxSnapDistance ? best : null;
}

/** A* over triangle adjacency; output is a server-side Y-up waypoint polyline. */
export function findNavmeshPath(
  mesh: RegionNavmesh,
  start: Vec3,
  end: Vec3,
  maxSnapDistance = 8,
): Vec3[] | null {
  if (!isVec3(start) || !isVec3(end) || !Number.isFinite(maxSnapDistance) || maxSnapDistance <= 0) return null;
  const startId = nearestPolygon(mesh, start, maxSnapDistance);
  const endId = nearestPolygon(mesh, end, maxSnapDistance);
  if (startId === null || endId === null) return null;
  if (startId === endId) return [ [...start], [...end] ];
  const open = new Set<number>([startId]);
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>([[startId, 0]]);
  const fScore = new Map<number, number>([[startId, distance(centroid(mesh, startId), centroid(mesh, endId))]]);
  while (open.size) {
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
      const points: Vec3[] = [[...start]];
      for (const id of chain) points.push(centroid(mesh, id));
      points.push([...end]);
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
