import type { Vec3 } from "@bw/shared";

export interface LiveNpcInteractionPosition {
  regionId: string;
  position: Vec3;
}

/** Resolve a scheduled NPC's interaction point only from its active snapshot in the player's region. */
export function resolveNpcInteractionPosition(
  fallback: Vec3,
  live: LiveNpcInteractionPosition | undefined,
  expectedRegionId: string,
  isScheduled: boolean,
): Vec3 | null {
  if (live) {
    if (live.regionId !== expectedRegionId || !live.position.every(Number.isFinite)) return null;
    return [...live.position];
  }
  if (isScheduled) return null;
  return fallback.every(Number.isFinite) ? [...fallback] : null;
}
