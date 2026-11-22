export type HorizontalVelocity = readonly [x: number, z: number];

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
