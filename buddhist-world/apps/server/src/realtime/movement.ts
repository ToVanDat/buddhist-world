import {
  MAX_HORIZONTAL_SPEED, MAX_VERTICAL_SPEED, SPEED_TOLERANCE,
  type RegionDef, type Vec3,
} from "@bw/shared";
import type { RegionNavmesh } from "../modules/world/navmeshPathfinding.js";

export type MoveVerdict =
  | { ok: true; position: Vec3 }
  | { ok: false; reason: "out_of_bounds" | "too_fast" | "blocked"; position: Vec3 };

const clampDt = (dt: number) => Math.min(Math.max(dt, 0.02), 1.0);

/** Keep facing direction bounded before storing it or broadcasting snapshots. */
export function normalizeYaw(yaw: number, fallback = 0): number {
  const value = Number.isFinite(yaw) ? yaw : fallback;
  const normalized = ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** Kiểm tra vị trí lưu cũ có hữu hạn và còn nằm trong region trước khi dùng làm spawn. */
export function isPositionInBounds(region: RegionDef, position: readonly number[]): position is Vec3 {
  if (position.length !== 3 || !position.every(Number.isFinite)) return false;
  const { min, max } = region.bounds;
  return position.every((value, index) => value >= min[index]! && value <= max[index]!);
}

export interface SavedLocation {
  regionId: string;
  spawnId: string;
  position: readonly number[];
  yaw?: number;
}

/** Restores a saved location only when its region, checkpoint and coordinates remain valid. */
export function resolveSavedLocation(
  region: RegionDef,
  saved: SavedLocation | null | undefined,
): { position: Vec3; yaw: number } | null {
  if (!saved || saved.regionId !== region.id) return null;
  const spawn = region.spawns.find((item) => item.id === saved.spawnId);
  if (!spawn || !isPositionInBounds(region, saved.position)) return null;
  return {
    position: [saved.position[0]!, saved.position[1]!, saved.position[2]!],
    yaw: normalizeYaw(saved.yaw ?? spawn.yaw, spawn.yaw),
  };
}

const NAVMESH_VERTICAL_TOLERANCE = 1.75;
const NAVMESH_SAMPLE_DISTANCE = 0.5;

/** True when a world position projects onto a walkable Y-up navmesh triangle. */
export function isWalkablePosition(
  mesh: RegionNavmesh,
  point: Vec3,
  verticalTolerance = NAVMESH_VERTICAL_TOLERANCE,
): boolean {
  for (const polygon of mesh.polygons) {
    const a = mesh.vertices[polygon.vertices[0]]!;
    const b = mesh.vertices[polygon.vertices[1]]!;
    const c = mesh.vertices[polygon.vertices[2]]!;
    const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(denominator) < 1e-8) continue;
    const u = ((b[2] - c[2]) * (point[0] - c[0]) + (c[0] - b[0]) * (point[2] - c[2])) / denominator;
    const v = ((c[2] - a[2]) * (point[0] - c[0]) + (a[0] - c[0]) * (point[2] - c[2])) / denominator;
    const w = 1 - u - v;
    if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
    const floorY = u * a[1] + v * b[1] + w * c[1];
    if (Math.abs(point[1] - floorY) <= verticalTolerance) return true;
  }
  return false;
}

/** Prevent tunnelling through gaps by checking the full movement segment at fixed intervals. */
export function isWalkableSegment(mesh: RegionNavmesh, from: Vec3, to: Vec3): boolean {
  const distance = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const samples = Math.max(1, Math.ceil(distance / NAVMESH_SAMPLE_DISTANCE));
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const point: Vec3 = [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ];
    if (!isWalkablePosition(mesh, point)) return false;
  }
  return true;
}

/** Validate speed, region bounds and (when exported) server-side walkable collision. */
export function validateMove(
  region: RegionDef,
  last: Vec3,
  next: Vec3,
  dtSec: number,
  navmesh?: RegionNavmesh | null,
): MoveVerdict {
  if (!isPositionInBounds(region, next)) return { ok: false, reason: "out_of_bounds", position: last };
  const dt = clampDt(dtSec);
  const horiz = Math.hypot(next[0] - last[0], next[2] - last[2]) / dt;
  const vert = Math.abs(next[1] - last[1]) / dt;
  if (horiz > MAX_HORIZONTAL_SPEED * SPEED_TOLERANCE || vert > MAX_VERTICAL_SPEED * SPEED_TOLERANCE) {
    return { ok: false, reason: "too_fast", position: last };
  }
  if (navmesh && !isWalkableSegment(navmesh, last, next)) {
    return { ok: false, reason: "blocked", position: last };
  }
  return { ok: true, position: next };
}

export const distance2D = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
