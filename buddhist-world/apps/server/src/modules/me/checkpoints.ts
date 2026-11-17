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


/** A fresh heartbeat is authoritative only while its socket still owns the user's Redis lease. */
export function isOwnedFreshPresence(
  presence: Readonly<Record<string, string>>,
  currentOwnerToken: string | null | undefined,
  now = Date.now(),
): boolean {
  const hasValidPosition = (["x", "y", "z"] as const).every((key) =>
    typeof presence[key] === "string" &&
    presence[key]!.trim().length > 0 &&
    Number.isFinite(Number(presence[key])),
  );
  return typeof currentOwnerToken === "string" && currentOwnerToken.length > 0 &&
    presence.ownerToken === currentOwnerToken &&
    typeof presence.region === "string" && presence.region.length > 0 &&
    hasValidPosition &&
    isFreshPresenceTimestamp(Number(presence.heartbeatAt), now);
}


/** True only when the presence hash belongs to the currently leased socket. */
export function isPresenceLeaseCurrent(
  presence: Readonly<Record<string, string>>,
  currentOwnerToken: string | null | undefined,
): boolean {
  return typeof currentOwnerToken === "string" && currentOwnerToken.length > 0 &&
    presence.ownerToken === currentOwnerToken;
}
