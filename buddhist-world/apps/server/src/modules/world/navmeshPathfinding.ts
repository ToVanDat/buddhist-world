import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { getRegion, type Vec3 } from "@bw/shared";

export interface NavmeshPolygon { id: number; vertices: [number, number, number]; neighbors: number[] }
export interface RegionNavmesh {
  version: 1;
  regionId: string;
  coordinateSystem: "Y_UP_METERS";
  /** Maximum walkable incline in degrees; loader requires an explicit authored value. */
  maxSlopeDegrees?: number;
  vertices: Vec3[];
  polygons: NavmeshPolygon[];
}
const moduleDir = dirname(fileURLToPath(import.meta.url));

function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

/** Resolve only normalized navmesh paths under the web public asset root. */
export function resolveNavmeshFilePath(navmeshUri: string): string {
  if (!navmeshUri.startsWith("/assets/navmesh/") || navmeshUri.includes("\\") ||
      navmeshUri.split("/").some((segment) => segment === "." || segment === "..") ||
      /[?#\s]/.test(navmeshUri) || /%(?:2e|2f|5c)/i.test(navmeshUri)) {
    throw new Error("Navmesh URI must be a normalized path under /assets/navmesh/");
  }
  const publicRoot = resolve(moduleDir, "../../../../web/public");
  const filePath = resolve(publicRoot, navmeshUri.slice(1));
  if (!filePath.startsWith(publicRoot + sep)) {
    throw new Error("Navmesh URI resolves outside the public asset root");
  }
  return filePath;
}

/** Load the exact navmesh URL declared by the shared region manifest. */
export function loadRegionNavmesh(regionId: string): RegionNavmesh | null {
  const region = getRegion(regionId);
  if (!region?.navmesh) return null;
  const filePath = resolveNavmeshFilePath(region.navmesh);
  try {
    const value = JSON.parse(readFileSync(filePath, "utf8")) as Partial<RegionNavmesh>;
    if (value.version !== 1 || value.regionId !== regionId || value.coordinateSystem !== "Y_UP_METERS" ||
        typeof value.maxSlopeDegrees !== "number" || !Number.isFinite(value.maxSlopeDegrees) ||
        value.maxSlopeDegrees <= 0 || value.maxSlopeDegrees >= 80 ||
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
function triangleNormalY(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = subtract(b, a), ac = subtract(c, a);
  const cross: Vec3 = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const magnitude = Math.hypot(cross[0], cross[1], cross[2]);
  return magnitude > 0 ? cross[1] / magnitude : -1;
}
function triangleArea(a: Vec3, b: Vec3, c: Vec3): number {
  return triangleNormalY(a, b, c) === -1 ? 0 : (() => {
    const ab = subtract(b, a), ac = subtract(c, a);
    const cross: Vec3 = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    return Math.hypot(cross[0], cross[1], cross[2]) / 2;
  })();
}
function isWalkableTriangle(a: Vec3, b: Vec3, c: Vec3, maxSlopeDegrees: number): boolean {
  const normalY = triangleNormalY(a, b, c);
  return normalY > 0 && normalY >= Math.cos(maxSlopeDegrees * Math.PI / 180);
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


interface FunnelPortal { left: Vec3; right: Vec3 }
function areaXZ(a: Vec3, b: Vec3, c: Vec3): number {
  return (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
}
function samePointXZ(a: Vec3, b: Vec3): boolean {
  return Math.abs(a[0] - b[0]) <= 1e-7 && Math.abs(a[2] - b[2]) <= 1e-7;
}
function pushUnique(points: Vec3[], point: Vec3) {
  if (!points.length || !samePointXZ(points[points.length - 1]!, point)) points.push([...point]);
}

/** Build consistently oriented left/right portals from the shared triangle edges. */
function buildCorridorPortals(mesh: RegionNavmesh, corridor: readonly number[], start: Vec3, end: Vec3): FunnelPortal[] | null {
  const portals: FunnelPortal[] = [{ left: start, right: start }];
  for (let index = 0; index < corridor.length - 1; index += 1) {
    const current = mesh.polygons[corridor[index]!];
    const next = mesh.polygons[corridor[index + 1]!];
    if (!current || !next || !current.neighbors.includes(next.id) || !next.neighbors.includes(current.id)) return null;
    const shared = current.vertices.filter((vertex) => next.vertices.includes(vertex));
    if (shared.length !== 2) return null;
    const a = mesh.vertices[shared[0]!]!;
    const b = mesh.vertices[shared[1]!]!;
    const from = centroid(mesh, current.id);
    const to = centroid(mesh, next.id);
    const side = (to[0] - from[0]) * (a[2] - from[2]) - (to[2] - from[2]) * (a[0] - from[0]);
    // Funnel signed-area convention in XZ uses the opposite handedness from
    // the world-space cross product above.
    portals.push(side >= 0 ? { left: b, right: a } : { left: a, right: b });
  }
  portals.push({ left: end, right: end });
  return portals;
}

/** Simple Stupid Funnel (string pulling) over the A* triangle corridor. */
function stringPull(portals: readonly FunnelPortal[]): Vec3[] {
  if (portals.length <= 1) return portals.length ? [[...portals[0]!.left]] : [];
  const result: Vec3[] = [[...portals[0]!.left]];
  let apex = portals[0]!.left;
  let left = apex;
  let right = portals[0]!.right;
  let apexIndex = 0, leftIndex = 0, rightIndex = 0;

  for (let index = 1; index < portals.length; index += 1) {
    const nextLeft = portals[index]!.left;
    const nextRight = portals[index]!.right;

    if (areaXZ(apex, right, nextRight) <= 0) {
      if (samePointXZ(apex, right) || areaXZ(apex, left, nextRight) > 0) {
        right = nextRight;
        rightIndex = index;
      } else {
        pushUnique(result, left);
        apex = left;
        apexIndex = leftIndex;
        left = apex;
        right = apex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        index = apexIndex;
        continue;
      }
    }

    if (areaXZ(apex, left, nextLeft) >= 0) {
      if (samePointXZ(apex, left) || areaXZ(apex, right, nextLeft) < 0) {
        left = nextLeft;
        leftIndex = index;
      } else {
        pushUnique(result, right);
        apex = right;
        apexIndex = rightIndex;
        left = apex;
        right = apex;
        leftIndex = apexIndex;
        rightIndex = apexIndex;
        index = apexIndex;
      }
    }
  }
  pushUnique(result, portals[portals.length - 1]!.left);
  return result;
}

const validMeshCache = new WeakSet<object>();
const invalidMeshCache = new WeakSet<object>();
function isValidSearchMesh(mesh: RegionNavmesh): boolean {
  if (!mesh || typeof mesh !== "object") return false;
  if (validMeshCache.has(mesh)) return true;
  if (invalidMeshCache.has(mesh)) return false;
  const valid = Array.isArray(mesh.vertices) && mesh.vertices.length > 0 &&
    mesh.vertices.every(isVec3) && Array.isArray(mesh.polygons) && mesh.polygons.length > 0 &&
    mesh.polygons.every((polygon, index) =>
      polygon && polygon.id === index && Array.isArray(polygon.vertices) && polygon.vertices.length === 3 &&
      new Set(polygon.vertices).size === 3 &&
      polygon.vertices.every((vertex) => Number.isInteger(vertex) && vertex >= 0 && vertex < mesh.vertices.length) &&
      triangleArea(mesh.vertices[polygon.vertices[0]]!, mesh.vertices[polygon.vertices[1]]!, mesh.vertices[polygon.vertices[2]]!) > 1e-8 &&
      isWalkableTriangle(mesh.vertices[polygon.vertices[0]]!, mesh.vertices[polygon.vertices[1]]!, mesh.vertices[polygon.vertices[2]]!,
        typeof mesh.maxSlopeDegrees === "number" && Number.isFinite(mesh.maxSlopeDegrees) && mesh.maxSlopeDegrees > 0 && mesh.maxSlopeDegrees < 80 ? mesh.maxSlopeDegrees : 55) &&
      Array.isArray(polygon.neighbors) &&
      new Set(polygon.neighbors).size === polygon.neighbors.length &&
      polygon.neighbors.every((neighbor) => Number.isInteger(neighbor) && neighbor >= 0 &&
        neighbor < mesh.polygons.length && neighbor !== index &&
        mesh.polygons[neighbor]?.neighbors?.includes(index) === true)
    );
  // Loaded navmesh documents are immutable at runtime, so memoize validation.
  if (valid) validMeshCache.add(mesh);
  else invalidMeshCache.add(mesh);
  return valid;
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
function nearestPolygonFromIds(mesh: RegionNavmesh, point: Vec3, ids: ReadonlySet<number>, maxSnapDistance: number): PolygonProjection | null {
  let best: PolygonProjection | null = null;
  for (const id of ids) {
    const polygon = mesh.polygons[id];
    if (!polygon) continue;
    const a = mesh.vertices[polygon.vertices[0]]!;
    const b = mesh.vertices[polygon.vertices[1]]!;
    const c = mesh.vertices[polygon.vertices[2]]!;
    const projected = closestPointOnTriangle(point, a, b, c);
    const candidateDistance = distance(point, projected);
    if (!best || candidateDistance < best.distance) best = { id, point: projected, distance: candidateDistance };
  }
  return best && best.distance <= maxSnapDistance ? best : null;
}

function nearbyPolygonIds(mesh: RegionNavmesh, startId: number, depth = 4): Set<number> {
  const visited = new Set<number>([startId]);
  let frontier = [startId];
  for (let level = 0; level < depth; level += 1) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const neighbor of mesh.polygons[id]!.neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return visited;
}

export function isSegmentWalkable(
  mesh: RegionNavmesh,
  start: Vec3,
  end: Vec3,
  maxSurfaceDistance = 1.5,
  maxSampleSpacing = 0.15,
): boolean {
  if (!isVec3(start) || !isVec3(end) || !Number.isFinite(maxSurfaceDistance) ||
      maxSurfaceDistance < 0 || !Number.isFinite(maxSampleSpacing) || maxSampleSpacing <= 0 ||
      !isValidSearchMesh(mesh)) return false;
  let current = nearestPolygon(mesh, start, maxSurfaceDistance);
  if (!current) return false;
  const startHorizontalOffset = Math.hypot(start[0] - current.point[0], start[2] - current.point[2]);
  if (startHorizontalOffset > 0.35 || Math.abs(start[1] - current.point[1]) > maxSurfaceDistance) return false;

  const length = distance(start, end);
  // Movement validation runs on a realtime path: reject pathological inputs
  // rather than allowing an untrusted segment/spacing pair to create an
  // unbounded per-tick sampling loop.
  const steps = Math.max(1, Math.ceil(length / maxSampleSpacing));
  if (!Number.isFinite(steps) || steps > 512) return false;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const sample: Vec3 = [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ];
    // Search only the current triangle and its connected neighborhood. This
    // bounds per-tick work and prevents snapping to a disconnected island.
    const candidates = nearbyPolygonIds(mesh, current.id, 4);
    const projection = nearestPolygonFromIds(mesh, sample, candidates, maxSurfaceDistance);
    if (!projection) return false;
    const horizontalOffset = Math.hypot(sample[0] - projection.point[0], sample[2] - projection.point[2]);
    const verticalOffset = Math.abs(sample[1] - projection.point[1]);
    if (horizontalOffset > 0.35 || verticalOffset > maxSurfaceDistance) return false;
    current = projection;
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
  if (!isVec3(start) || !isVec3(end) || !Number.isFinite(maxSnapDistance) || maxSnapDistance <= 0 ||
      !isValidSearchMesh(mesh)) return null;
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
      const corridor = [current];
      while (cameFrom.has(corridor[0]!)) corridor.unshift(cameFrom.get(corridor[0]!)!);
      const portals = buildCorridorPortals(mesh, corridor, startProjection.point, endProjection.point);
      if (!portals) return null;
      const points = stringPull(portals);
      // Validate every smoothed segment against walkable triangles. If the
      // funnel cannot be represented safely by this mesh, fail closed.
      for (let index = 0; index < points.length - 1; index += 1) {
        if (!isSegmentWalkable(mesh, points[index]!, points[index + 1]!)) return null;
      }
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
