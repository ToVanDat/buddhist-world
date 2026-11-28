import { validateTempleSpawnSafety, type RegionDef, type SpawnPoint, type Vec3 } from "@bw/shared";

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
  if (spawn.position.some((value, axis) => value < min[axis]! || value > max[axis]!)) return false;
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

  const fallback: SpawnPoint | undefined =
    region.spawns.find((point) => point.id === region.defaultSpawn) ?? region.spawns[0];
  if (!fallback) return null;

  return {
    spawn: { position: fallback.position, yaw: fallback.yaw },
    source: "manifest",
  };
}
