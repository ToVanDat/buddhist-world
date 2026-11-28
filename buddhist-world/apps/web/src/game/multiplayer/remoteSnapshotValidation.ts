import { ANIMATIONS, getRegion, type RemotePlayerSnapshot } from "@bw/shared";

/** Reject malformed, duplicate, or cross-region remote snapshots before they reach Three.js. */
export function validateRemotePlayerSnapshots(raw: unknown, regionId: string | null): RemotePlayerSnapshot[] {
  const region = regionId ? getRegion(regionId) : undefined;
  if (!region || !Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const valid: RemotePlayerSnapshot[] = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const player = value as Partial<RemotePlayerSnapshot>;
    if (typeof player.id !== "string" || !player.id || player.id.length > 128 || seen.has(player.id) ||
        typeof player.name !== "string" || !player.name.trim() || player.name.length > 32 ||
        !Array.isArray(player.p) || player.p.length !== 3 ||
        !player.p.every((coordinate, index) => Number.isFinite(coordinate) &&
          coordinate >= region.bounds.min[index]! && coordinate <= region.bounds.max[index]!) ||
        !Number.isFinite(player.yaw) || !ANIMATIONS.includes(player.anim as (typeof ANIMATIONS)[number])) continue;
    seen.add(player.id);
    valid.push(player as RemotePlayerSnapshot);
  }
  return valid;
}
