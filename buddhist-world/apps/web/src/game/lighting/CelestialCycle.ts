export interface WorldClockSnapshot {
  worldMinute: number;
  worldSecond: number;
}

export type WorldDirection = [number, number, number];

export interface CelestialDirections {
  worldMinute: number;
  sun: WorldDirection;
  moon: WorldDirection;
  daylight: number;
  night: number;
}

const TAU = Math.PI * 2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function normalizeDirection(direction: WorldDirection): WorldDirection {
  const length = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

/** Extrapolates the authoritative world clock without requiring per-frame network updates. */
export function resolveWorldMinute(
  snapshot: WorldClockSnapshot | null,
  receivedAt: number | null,
  now = Date.now(),
): number {
  if (!snapshot) return 720;
  const elapsedSeconds = receivedAt === null ? 0 : Math.max(0, (now - receivedAt) / 1000);
  const raw = snapshot.worldMinute + (snapshot.worldSecond + elapsedSeconds) / 60;
  return ((raw % 1440) + 1440) % 1440;
}

/**
 * World axes: +X is sunrise/east, -X is sunset/west, +Y is above the horizon.
 * Sun and moon share one celestial plane and use the same world origin.
 */
export function resolveCelestialDirections(worldMinute: number): CelestialDirections {
  const minute = ((Number.isFinite(worldMinute) ? worldMinute : 720) % 1440 + 1440) % 1440;
  const solarAngle = ((minute - 360) / 1440) * TAU;
  const sun = normalizeDirection([Math.cos(solarAngle), Math.sin(solarAngle), -0.28]);
  const moon = normalizeDirection([-sun[0], -sun[1], -sun[2]]);
  const daylight = smoothstep(-0.12, 0.22, sun[1]);
  return {
    worldMinute: minute,
    sun,
    moon,
    daylight,
    night: 1 - daylight,
  };
}
