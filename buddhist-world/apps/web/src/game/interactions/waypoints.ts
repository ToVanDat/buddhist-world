import type { SpawnPoint, Vec3 } from "@bw/shared";

/** Horizontal distance is used because a waypoint represents a walkable ground destination. */
export function getWaypointDistance(position: Vec3 | null, target: SpawnPoint): number | null {
  if (!position || !position.every(Number.isFinite)) return null;
  return Math.hypot(position[0] - target.position[0], position[2] - target.position[2]);
}


/** Absolute world bearing: 0 = +Z, positive angles rotate toward +X. */
export function getWaypointBearing(position: Vec3 | null, target: SpawnPoint): number | null {
  if (!position || !position.every(Number.isFinite)) return null;
  const dx = target.position[0] - position[0];
  const dz = target.position[2] - position[2];
  if (Math.hypot(dx, dz) < 0.05) return 0;
  return Math.atan2(dx, dz);
}

/** Bearing relative to the player's current facing, normalized to [-PI, PI]. */
export function getWaypointRelativeBearing(
  position: Vec3 | null,
  target: SpawnPoint,
  heading: number,
): number | null {
  const bearing = getWaypointBearing(position, target);
  if (bearing === null || !Number.isFinite(heading)) return null;
  const delta = bearing - heading;
  return Math.atan2(Math.sin(delta), Math.cos(delta));
}
