import type { Quality } from "../rendering/quality";

export type LightingPreset = "dawn" | "day" | "sunset" | "night";

export interface EnvironmentLightingProfile {
  background: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  hemisphereIntensity: number;
  sunIntensity: number;
  sunColor: string;
  sunPosition: [number, number, number];
  exposure: number;
  shadowCameraBounds: number;
}

export const ENVIRONMENT_LIGHTING_PROFILES: Record<LightingPreset, EnvironmentLightingProfile> = {
  dawn: {
    background: "#9b8790", fogColor: "#b9a2a0", fogNear: 38, fogFar: 250,
    ambientIntensity: 0.42, hemisphereIntensity: 0.62, sunIntensity: 2.1,
    sunColor: "#ffd0a1", sunPosition: [-80, 32, 55], exposure: 1.05, shadowCameraBounds: 140,
  },
  day: {
    background: "#9bb8cc", fogColor: "#b8c9c9", fogNear: 65, fogFar: 330,
    ambientIntensity: 0.34, hemisphereIntensity: 0.78, sunIntensity: 3,
    sunColor: "#fff1d6", sunPosition: [75, 105, 45], exposure: 1, shadowCameraBounds: 140,
  },
  sunset: {
    background: "#80616b", fogColor: "#c18a76", fogNear: 30, fogFar: 220,
    ambientIntensity: 0.38, hemisphereIntensity: 0.55, sunIntensity: 2.35,
    sunColor: "#ffad78", sunPosition: [95, 24, -65], exposure: 1.08, shadowCameraBounds: 140,
  },
  night: {
    background: "#101a2c", fogColor: "#26374a", fogNear: 18, fogFar: 150,
    ambientIntensity: 0.16, hemisphereIntensity: 0.3, sunIntensity: 0.12,
    sunColor: "#9ab8e8", sunPosition: [-35, 70, -20], exposure: 0.82, shadowCameraBounds: 100,
  },
};

export interface LightingQualityProfile {
  shadowMapSize: number;
  shadows: boolean;
  fog: boolean;
  environmentIntensity: number;
  maxLocalLights: number;
  reflections: boolean;
  reflectionResolution: number;
  cinematicEffects: boolean;
  bloomStrength: number;
  postProcessPixelRatio: number;
}

export const LIGHTING_QUALITY_PROFILES: Record<Quality, LightingQualityProfile> = {
  ULTRA: { shadowMapSize: 4096, shadows: true, fog: true, environmentIntensity: 1, maxLocalLights: 24, reflections: true, reflectionResolution: 768, cinematicEffects: true, bloomStrength: 0.16, postProcessPixelRatio: 1.5 },
  HIGH: { shadowMapSize: 2048, shadows: true, fog: true, environmentIntensity: 0.95, maxLocalLights: 16, reflections: true, reflectionResolution: 512, cinematicEffects: true, bloomStrength: 0.1, postProcessPixelRatio: 1 },
  MEDIUM: { shadowMapSize: 1024, shadows: true, fog: true, environmentIntensity: 0.85, maxLocalLights: 8, reflections: true, reflectionResolution: 256, cinematicEffects: false, bloomStrength: 0, postProcessPixelRatio: 1 },
  LOW: { shadowMapSize: 512, shadows: false, fog: false, environmentIntensity: 0.7, maxLocalLights: 3, reflections: false, reflectionResolution: 0, cinematicEffects: false, bloomStrength: 0, postProcessPixelRatio: 0.75 },
  MOBILE: { shadowMapSize: 512, shadows: false, fog: true, environmentIntensity: 0.8, maxLocalLights: 4, reflections: false, reflectionResolution: 0, cinematicEffects: false, bloomStrength: 0, postProcessPixelRatio: 0.75 },
};

export function resolveLightingQuality(quality: Quality): LightingQualityProfile {
  return LIGHTING_QUALITY_PROFILES[quality];
}
