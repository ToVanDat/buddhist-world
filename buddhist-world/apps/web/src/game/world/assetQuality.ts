import type { Quality } from "../rendering/quality";

/** Visual-only geometry budgets. These never affect Rapier collision geometry. */
export function resolveArchitectureSegments(quality: Quality): readonly [number, number] {
  switch (quality) {
    case "ULTRA": return [40, 22];
    case "HIGH": return [32, 18];
    case "MEDIUM": return [24, 12];
    case "LOW":
    case "MOBILE": return [16, 8];
  }
}

export function resolveMountainSegments(quality: Quality): readonly [number, number, number] {
  switch (quality) {
    case "ULTRA": return [28, 18, 10];
    case "HIGH": return [24, 16, 8];
    case "MEDIUM": return [18, 12, 6];
    case "LOW":
    case "MOBILE": return [12, 8, 4];
  }
}

/** Near→mid, mid→far and far→cull thresholds in world units. */
/** Stable physics tessellation: independent of the selected visual quality/LOD. */
export function resolveMountainColliderSegments(): number {
  return Math.max(28, ...(["ULTRA", "HIGH", "MEDIUM", "LOW", "MOBILE"] as const)
    .map((quality) => resolveMountainSegments(quality)[0]));
}

export function resolveMountainLodDistances(quality: Quality): readonly [number, number, number] {
  switch (quality) {
    case "ULTRA": return [100, 210, 360];
    case "HIGH": return [90, 185, 320];
    case "MEDIUM": return [75, 155, 270];
    case "LOW":
    case "MOBILE": return [58, 125, 220];
  }
}

export function resolveWaterfallMistCount(quality: Quality): number {
  switch (quality) {
    case "ULTRA": return 120;
    case "HIGH": return 96;
    case "MEDIUM": return 64;
    case "LOW":
    case "MOBILE": return 32;
  }
}
/** Maximum camera distance for waterfall mist before its transparent point pass is hidden. */
export function resolveWaterfallMistDistance(quality: Quality): number {
  switch (quality) {
    case "ULTRA": return 180;
    case "HIGH": return 145;
    case "MEDIUM": return 105;
    case "LOW": return 72;
    case "MOBILE": return 58;
  }
}

/** CPU transform refresh cadence for broad per-instance wind sway. */
export function resolveInstanceMatrixUpdateInterval(quality: Quality): number {
  switch (quality) {
    case "ULTRA":
    case "HIGH": return 1 / 30;
    case "MEDIUM": return 1 / 24;
    case "LOW":
    case "MOBILE": return 1 / 15;
  }
}

export interface AssetLodLevel { distance: number; hysteresis?: number }

/** Resolve a three-level LOD with hysteresis and a separate cull boundary. */
export function resolveAssetLodLevel(
  distance: number,
  currentLevel: number,
  levels: readonly [AssetLodLevel, AssetLodLevel, AssetLodLevel],
  cullDistance: number,
): number {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(cullDistance) || cullDistance <= 0) {
    return currentLevel;
  }
  const cullHysteresis = 0.05;
  if (currentLevel < 0) {
    if (distance >= cullDistance * (1 - cullHysteresis)) return -1;
    currentLevel = 2;
  } else if (distance >= cullDistance * (1 + cullHysteresis)) {
    return -1;
  }

  let level = Math.min(2, Math.max(0, currentLevel));
  while (level < 2) {
    const next = levels[level + 1]!;
    if (distance < next.distance * (1 + (next.hysteresis ?? 0.08))) break;
    level += 1;
  }
  while (level > 0) {
    const boundary = levels[level]!;
    if (distance >= boundary.distance * (1 - (boundary.hysteresis ?? 0.08))) break;
    level -= 1;
  }
  return level;
}


/** Quality-aware particle cap for lightweight ambient emitters. */
export function resolveSmokeParticleCount(requested: number, quality: Quality): number {
  const base = Number.isFinite(requested) ? Math.floor(requested) : 18;
  const bounded = Math.max(1, Math.min(48, base));
  const scale: Record<Quality, number> = {
    ULTRA: 1,
    HIGH: 0.85,
    MEDIUM: 0.7,
    LOW: 0.5,
    MOBILE: 0.35,
  };
  return Math.max(1, Math.min(48, Math.round(bounded * scale[quality])));
}
