import { getWorldInteraction, type Vec3 } from "@bw/shared";

/** Authoritative range check shared by REST item actions and realtime world rules. */
export function isNearWorldInteraction(position: Vec3, regionId: string, targetId: string, scheduledPosition?: Vec3): boolean {
  const target = getWorldInteraction(targetId);
  if (!target || target.regionId !== regionId) return false;
  const horizontal = Math.hypot(position[0] - target.position[0], position[2] - target.position[2]);
  const vertical = Math.abs(position[1] - target.position[1]);
  return Number.isFinite(horizontal) && Number.isFinite(vertical) &&
    horizontal <= target.radius && vertical <= 3.5;
}
