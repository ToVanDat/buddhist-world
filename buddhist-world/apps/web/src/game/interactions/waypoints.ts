import type { SpawnPoint, Vec3 } from "@bw/shared";

/** Horizontal distance is used because a waypoint represents a walkable ground destination. */
export function getWaypointDistance(position: Vec3 | null, target: SpawnPoint): number | null {
  if (!position || !position.every(Number.isFinite)) return null;
  return Math.hypot(position[0] - target.position[0], position[2] - target.position[2]);
}
