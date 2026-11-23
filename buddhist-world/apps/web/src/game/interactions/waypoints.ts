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

/** Return the next declared visitor landmark, wrapping to the first stop. */
export function getNextWaypointId(
  destinations: readonly Pick<SpawnPoint, "id">[],
  currentId: string | null,
): string | null {
  if (destinations.length === 0) return null;
  const currentIndex = destinations.findIndex((destination) => destination.id === currentId);
  return destinations[(currentIndex + 1) % destinations.length]?.id ?? null;
}

/** Keep only unique, known landmark IDs when restoring locally saved tour progress. */
export function getVisitedWaypointIds(
  value: unknown,
  destinations: readonly Pick<SpawnPoint, "id">[],
): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(destinations.map((destination) => destination.id));
  return [...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id)))];
}

/** Return the first landmark not yet visited, preserving the region manifest order. */
export function getNextUnvisitedWaypointId(
  destinations: readonly Pick<SpawnPoint, "id">[],
  visitedIds: readonly string[],
): string | null {
  const visited = new Set(visitedIds);
  return destinations.find((destination) => !visited.has(destination.id))?.id ?? null;
}

export function getVisitorTourProgress(
  destinations: readonly Pick<SpawnPoint, "id">[],
  visitedIds: readonly string[],
): { visited: number; total: number; complete: boolean } {
  const validVisited = new Set(getVisitedWaypointIds(visitedIds, destinations));
  return {
    visited: validVisited.size,
    total: destinations.length,
    complete: destinations.length > 0 && validVisited.size === destinations.length,
  };
}
