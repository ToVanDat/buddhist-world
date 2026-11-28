import { isInsideLotusPondFootprint, TEMPLE_LAYOUT } from "@bw/shared";

export type HorizontalVelocity = readonly [x: number, z: number];

/** Reject malformed spawn/network coordinates before they enter Rapier. */
export function isFiniteWorldPosition(position: readonly number[]): position is readonly [number, number, number] {
  return position.length === 3 && position.every(Number.isFinite);
}

export function resolveFiniteSpawnPosition(
  position: readonly number[],
  fallback: readonly [number, number, number] = TEMPLE_LAYOUT.spawns.mainEntrance.position,
): [number, number, number] {
  return isFiniteWorldPosition(position) ? [...position] : [...fallback];
}

export const PLAYER_CAPSULE_HALF_HEIGHT = 0.45;
export const PLAYER_CAPSULE_RADIUS = 0.35;
export const PLAYER_CAPSULE_HALF_EXTENT = PLAYER_CAPSULE_HALF_HEIGHT + PLAYER_CAPSULE_RADIUS;
export const GROUND_PROBE_OFFSET = 0.08;
export const GROUND_PROBE_DISTANCE = 0.18;

/** Start the ground ray just above the capsule bottom, not at its center. */
export function resolveGroundProbeOrigin(position: readonly [number, number, number]): [number, number, number] {
  return [
    position[0],
    position[1] - PLAYER_CAPSULE_HALF_EXTENT + GROUND_PROBE_OFFSET,
    position[2],
  ];
}


/** True only while the player's capsule intersects the shallow-water band of the lotus pond. */
export function isPlayerWading(position: readonly [number, number, number]): boolean {
  if (!position.every(Number.isFinite)) return false;
  const waterTop = TEMPLE_LAYOUT.pond.waterSurfaceY;
  const capsuleBottom = position[1] - PLAYER_CAPSULE_HALF_EXTENT;
  const capsuleTop = position[1] + PLAYER_CAPSULE_HALF_EXTENT;
  // The lower bound follows the authored pond depth; the upper bound prevents
  // bridges, balconies and raised paths over the pond from applying water drag.
  return isInsideLotusPondFootprint(position) &&
    capsuleBottom <= waterTop + 0.15 &&
    capsuleTop >= TEMPLE_LAYOUT.pond.collisionBottomY;
}

const MAX_FRAME_DELTA = 0.05;
const GROUNDED_ACCELERATION = 14;
const GROUNDED_BRAKING = 18;
const AIR_ACCELERATION = 5;
const AIR_BRAKING = 2.5;

/**
 * Move horizontal velocity toward the requested velocity with bounded acceleration.
 * The controller remains server-authoritative; this only shapes local physical movement.
 */
export function resolveHorizontalVelocity(
  current: HorizontalVelocity,
  target: HorizontalVelocity,
  deltaSeconds: number,
  grounded: boolean,
): [number, number] {
  // Never allow malformed joystick/network/physics values to propagate into Rapier.
  if (![current[0], current[1], target[0], target[1]].every(Number.isFinite)) return [0, 0];
  const dt = Number.isFinite(deltaSeconds)
    ? Math.max(0, Math.min(deltaSeconds, MAX_FRAME_DELTA))
    : 0;
  if (dt === 0) return [current[0], current[1]];

  const dx = target[0] - current[0];
  const dz = target[1] - current[1];
  const difference = Math.hypot(dx, dz);
  if (difference < 1e-6) return [target[0], target[1]];

  const targetSpeed = Math.hypot(target[0], target[1]);
  const acceleration = targetSpeed > 0.01
    ? (grounded ? GROUNDED_ACCELERATION : AIR_ACCELERATION)
    : (grounded ? GROUNDED_BRAKING : AIR_BRAKING);
  const maxChange = acceleration * dt;

  if (difference <= maxChange) return [target[0], target[1]];
  const scale = maxChange / difference;
  return [current[0] + dx * scale, current[1] + dz * scale];
}
