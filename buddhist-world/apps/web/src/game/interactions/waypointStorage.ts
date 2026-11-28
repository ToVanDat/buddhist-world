import type { SpawnPoint } from "@bw/shared";

export function waypointStorageKey(regionId: string): string {
  return `bw.world.waypoint.v1:${encodeURIComponent(regionId.trim())}`;
}

/** Restore only a waypoint that still exists in the active region manifest. */
export function parseStoredWaypointId(raw: string | null, spawns: readonly Pick<SpawnPoint, "id">[]): string | null {
  if (!raw || raw.length > 128) return null;
  const id = raw.trim();
  return id && spawns.some((spawn) => spawn.id === id) ? id : null;
}
