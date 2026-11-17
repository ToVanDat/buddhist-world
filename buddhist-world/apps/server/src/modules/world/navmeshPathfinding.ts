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

/** Validate runtime geometry as strictly as the Blender/CI navmesh acceptance tool. */
export function validateRegionNavmesh(value: unknown, regionId: string): RegionNavmesh {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid navmesh document for region " + regionId);
  }
  const document = value as Record<string, unknown>;
  if (document.version !== 1 || document.regionId !== regionId || document.coordinateSystem !== "Y_UP_METERS" ||
      !Array.isArray(document.vertices) || document.vertices.length === 0 ||
      !document.vertices.every(isVec3) ||
      !Array.isArray(document.polygons) || document.polygons.length === 0) {
    throw new Error("Navmesh manifest mismatch or invalid geometry for region " + regionId);
  }

  const vertices = document.vertices as Vec3[];
  const rawPolygons = document.polygons as unknown[];
  const polygons: NavmeshPolygon[] = [];
  const edgeOwners = new Map<string, number[]>();

  for (let index = 0; index < rawPolygons.length; index += 1) {
    const raw = rawPolygons[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid navmesh polygon " + index + " in region " + regionId);
    }
    const polygon = raw as Record<string, unknown>;
    const triangle = polygon.vertices;
    const neighbors = polygon.neighbors;
    if (polygon.id !== index || !Array.isArray(triangle) || triangle.length !== 3 ||
        triangle.some((vertex) => !Number.isInteger(vertex) || (vertex as number) < 0 || (vertex as number) >= vertices.length) ||
        new Set(triangle).size !== 3 || !Array.isArray(neighbors) ||
        neighbors.some((neighbor) => !Number.isInteger(neighbor) || (neighbor as number) < 0 ||
          (neighbor as number) >= rawPolygons.length || neighbor === index) ||
        new Set(neighbors).size !== neighbors.length) {
      throw new Error("Invalid navmesh polygon " + index + " in region " + regionId);
    }

    const ids = triangle as [number, number, number];
    const [a, b, c] = ids.map((vertex) => vertices[vertex]!) as [Vec3, Vec3, Vec3];
    const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const normal: Vec3 = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ];
    const area2 = Math.hypot(...normal);
    if (area2 < 1e-6) throw new Error("Degenerate navmesh polygon " + index + " in region " + regionId);
    if (normal[1] / area2 < 0.01) throw new Error("Navmesh polygon " + index + " is not upward-facing in region " + regionId);

    const parsed: NavmeshPolygon = { id: index, vertices: ids, neighbors: neighbors as number[] };
    polygons.push(parsed);
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const edge = [ids[edgeIndex]!, ids[(edgeIndex + 1) % 3]!].sort((left, right) => left - right).join(":");
      const owners = edgeOwners.get(edge) ?? [];
      owners.push(index);
      edgeOwners.set(edge, owners);
      if (owners.length > 2) throw new Error("Non-manifold navmesh edge " + edge + " in region " + regionId);
    }
  }

  for (const polygon of polygons) {
    for (const neighborId of polygon.neighbors) {
      const neighbor = polygons[neighborId]!;
      if (!neighbor.neighbors.includes(polygon.id)) {
        throw new Error("Non-reciprocal navmesh adjacency " + polygon.id + "<->" + neighborId + " in region " + regionId);
      }
      const sharedVertices = polygon.vertices.filter((vertex) => neighbor.vertices.includes(vertex)).length;
      if (sharedVertices !== 2) {
        throw new Error("Navmesh adjacency " + polygon.id + "<->" + neighborId + " does not share an edge in region " + regionId);
      }
    }
  }

  for (const [edge, owners] of edgeOwners) {
    if (owners.length === 2 && !polygons[owners[0]!]!.neighbors.includes(owners[1]!)) {
      throw new Error("Shared navmesh edge " + edge + " is missing adjacency in region " + regionId);
    }
  }

  return { version: 1, regionId, coordinateSystem: "Y_UP_METERS", vertices, polygons };
}

/** Load the exact navmesh URL declared by the shared region manifest. */
export function loadRegionNavmesh(regionId: string): RegionNavmesh | null {
  const region = getRegion(regionId);
  if (!region?.navmesh) return null;
  const relative = region.navmesh.startsWith("/") ? region.navmesh.slice(1) : region.navmesh;
  const filePath = resolve(moduleDir, "../../../../web/public", relative);
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
    return validateRegionNavmesh(value, regionId);
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
function closestPointOnTriangle(point: Vec3, a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const dot = (left: Vec3, right: Vec3) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  const subtract = (left: Vec3, right: Vec3): Vec3 =>
    [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
  const addScaled = (origin: Vec3, direction: Vec3, scale: number): Vec3 =>
    [origin[0] + direction[0] * scale, origin[1] + direction[1] * scale, origin[2] + direction[2] * scale];

  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const ap = subtract(point, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;

  const bp = subtract(point, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return addScaled(a, ab, d1 / (d1 - d3));

  const cp = subtract(point, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return addScaled(a, ac, d2 / (d2 - d6));

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const edge = subtract(c, b);
    return addScaled(b, edge, (d4 - d3) / (d4 - d3 + d5 - d6));
  }

  const inverse = 1 / (va + vb + vc);
  const v = vb * inverse;
  const w = vc * inverse;
  return [
    a[0] + ab[0] * v + ac[0] * w,
    a[1] + ab[1] * v + ac[1] * w,
    a[2] + ab[2] * v + ac[2] * w,
  ];
}

/** Snap against the actual triangle surface, not its centroid (important for large/stacked floors). */
function nearestPolygon(mesh: RegionNavmesh, point: Vec3, maxSnapDistance: number): number | null {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const polygon of mesh.polygons) {
    const [a, b, c] = polygon.vertices.map((index) => mesh.vertices[index]!) as [Vec3, Vec3, Vec3];
    const closest = closestPointOnTriangle(point, a, b, c);
    const candidate = distance(point, closest);
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
