import type { Quality } from "./quality";

export interface CinematicGrade {
  contrast: number;
  saturation: number;
  warmth: number;
  lift: number;
}

/** Restrained neutral-warm film response; avoids aggressive teal/orange grading. */
export function resolveCinematicGrade(quality: Quality): CinematicGrade | null {
  if (quality === "ULTRA") return { contrast: 1.025, saturation: 1.035, warmth: 0.012, lift: 0.0015 };
  if (quality === "HIGH") return { contrast: 1.015, saturation: 1.02, warmth: 0.008, lift: 0.001 };
  return null;
}
