import type { Vec3 } from "@bw/shared";

export const TOUR_VISIT_RADIUS_M = 10;
export const TOUR_VISIT_VERTICAL_TOLERANCE_M = 4.5;

/** A tour stop is confirmed only from fresh server presence near its manifest coordinate. */
export function isNearTourStop(
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
  return horizontal <= TOUR_VISIT_RADIUS_M && vertical <= TOUR_VISIT_VERTICAL_TOLERANCE_M;
}

export function sanitizeVisitedSpawnIds(value: unknown, allowedIds: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set(allowedIds);
  return [...new Set(value.filter((id): id is string => typeof id === "string" && allowed.has(id)))].sort();
}
