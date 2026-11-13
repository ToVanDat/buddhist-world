import type { Quality } from "../rendering/quality";

/** Near/mid/far/cull thresholds in world units for procedural tree LOD. */
export const TREE_LOD_DISTANCES: Record<Quality, readonly [number, number, number]> = {
  ULTRA: [46, 96, 158],
  HIGH: [38, 82, 132],
  MEDIUM: [29, 64, 104],
  LOW: [21, 46, 78],
  MOBILE: [21, 46, 78],
};

export function resolveGrassDensity(quality: Quality): number {
  switch (quality) {
    case "ULTRA": return 1;
    case "HIGH": return 0.82;
    case "MEDIUM": return 0.58;
    case "LOW":
    case "MOBILE": return 0.34;
  }
}

export function resolveGrassVisibleDistance(quality: Quality): number {
  switch (quality) {
    case "ULTRA": return 118;
    case "HIGH": return 96;
    case "MEDIUM": return 72;
    case "LOW":
    case "MOBILE": return 48;
  }
}
