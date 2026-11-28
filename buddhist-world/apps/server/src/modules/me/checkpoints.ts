import { CHECKPOINT_RADIUS_M, CHECKPOINT_VERTICAL_TOLERANCE_M, type Vec3 } from "@bw/shared";

/** Checkpoint eligibility is based on authoritative server presence, not client intent. */
export function isNearCheckpoint(
  position: Vec3,
  currentRegionId: string,
  targetRegionId: string,
  targetPosition: Vec3,
): boolean {
  if (currentRegionId !== targetRegionId ||
      !position.every(Number.isFinite) ||
      !targetPosition.every(Number.isFinite)) return false;
  const horizontal = Math.hypot(position[0] - targetPosition[0], position[2] - targetPosition[2]);
  const vertical = Math.abs(position[1] - targetPosition[1]);
  return horizontal <= CHECKPOINT_RADIUS_M && vertical <= CHECKPOINT_VERTICAL_TOLERANCE_M;
}


/** Presence timestamps are server-generated milliseconds; allow small clock skew only. */
export function isFreshPresenceTimestamp(heartbeatAt: number, now = Date.now()): boolean {
  const age = now - heartbeatAt;
  return Number.isFinite(heartbeatAt) && Number.isFinite(now) && age >= -5_000 && age <= 30_000;
}
