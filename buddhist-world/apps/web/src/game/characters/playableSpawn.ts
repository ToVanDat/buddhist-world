import { validateTempleSpawnSafety, type RegionDef, type SpawnPoint, type Vec3 } from "@bw/shared";
import { PLAYER_CAPSULE_HALF_EXTENT, PLAYER_CAPSULE_RADIUS } from "./locomotion";

export type SpawnTransform = { position: Vec3; yaw: number };
export interface PlayableSpawnResolution {
  spawn: SpawnTransform;
  source: "server" | "manifest";
}

/**
 * Reject malformed or unsafe authoritative spawn data before it reaches Rapier.
 */
export function isSafeSpawn(spawn: SpawnTransform, region: RegionDef | undefined): boolean {
  if (!region || !Array.isArray(spawn.position) || spawn.position.length !== 3 ||
      !spawn.position.every(Number.isFinite) || !Number.isFinite(spawn.yaw)) return false;
  const { min, max } = region.bounds;
  // Bounds describe walkable world space; keep the entire player capsule inside,
  // not merely its center. This prevents edge spawns from clipping the world shell.
  const margins = [PLAYER_CAPSULE_RADIUS, PLAYER_CAPSULE_HALF_EXTENT, PLAYER_CAPSULE_RADIUS] as const;
  if (spawn.position.some((value, axis) =>
    value < min[axis]! + margins[axis]! || value > max[axis]! - margins[axis]!
  )) return false;
  return validateTempleSpawnSafety([{ id: "candidate", position: spawn.position }], region.id).length === 0;
}

/**
 * Keep the world locally explorable while the realtime service is connecting.
 * Server-provided spawn data always wins; the shared region manifest is only a
 * safe movement/camera fallback and does not grant server-backed progress.
 */
export function resolvePlayableSpawn(
  serverSpawn: SpawnTransform | null | undefined,
  region: RegionDef | undefined,
): PlayableSpawnResolution | null {
  if (serverSpawn && isSafeSpawn(serverSpawn, region)) return { spawn: serverSpawn, source: "server" };
  if (!region || region.spawns.length === 0) return null;

  const defaultSpawn = region.spawns.find((point) => point.id === region.defaultSpawn);
  const fallback: SpawnPoint | undefined = [
    defaultSpawn,
    ...region.spawns.filter((point) => point.id !== region.defaultSpawn),
  ].find((point): point is SpawnPoint =>
    Boolean(point && isSafeSpawn({ position: point.position, yaw: point.yaw }, region))
  );
  if (!fallback) return null;

  return {
    spawn: { position: fallback.position, yaw: fallback.yaw },
    source: "manifest",
  };
}
