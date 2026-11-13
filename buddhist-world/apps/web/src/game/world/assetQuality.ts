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