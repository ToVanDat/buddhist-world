export type Quality = "ULTRA" | "HIGH" | "MEDIUM" | "LOW" | "MOBILE";

export interface QualityProfile {
  dpr: [number, number];
  shadows: boolean;
  shadowMapSize: number;
  antialias: boolean;
  fog: boolean;
}

export const PROFILES: Record<Quality, QualityProfile> = {
  ULTRA:  { dpr: [1, 2], shadows: true, shadowMapSize: 4096, antialias: true, fog: true },
  HIGH:   { dpr: [1, 1.75], shadows: true, shadowMapSize: 2048, antialias: true, fog: true },
  MEDIUM: { dpr: [1, 1.25], shadows: true, shadowMapSize: 1024, antialias: true, fog: true },
  LOW:    { dpr: [0.75, 1], shadows: false, shadowMapSize: 512, antialias: false, fog: false },
  MOBILE: { dpr: [0.75, 1], shadows: false, shadowMapSize: 512, antialias: false, fog: true },
};

export const isTouchDevice = () =>
  typeof window !== "undefined" && (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window);

export function detectInitialQuality(): Quality {
  if (isTouchDevice()) return "MOBILE";
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 4 : 4;
  return cores <= 4 ? "MEDIUM" : "HIGH";
}

export function stepDown(q: Quality): Quality {
  if (q === "ULTRA") return "HIGH";
  if (q === "HIGH") return "MEDIUM";
  if (q === "MEDIUM" || q === "MOBILE") return "LOW";
  return "LOW";
}
