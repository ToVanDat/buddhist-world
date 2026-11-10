import type { EnvironmentLightingProfile, LightingPreset } from "./LightingProfiles";
import { ENVIRONMENT_LIGHTING_PROFILES } from "./LightingProfiles";

function channel(hex: string, offset: number): number {
  return Number.parseInt(hex.slice(offset, offset + 2), 16);
}

export function blendHexColor(from: string, to: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount));
  const a = from.replace("#", "");
  const b = to.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(a) || !/^[0-9a-fA-F]{6}$/.test(b)) {
    throw new Error("Lighting colors must be six-digit hex values.");
  }
  const values = [0, 2, 4].map((offset) =>
    Math.round(channel(a, offset) + (channel(b, offset) - channel(a, offset)) * t),
  );
  return `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function interpolateLightingProfiles(
  from: EnvironmentLightingProfile,
  to: EnvironmentLightingProfile,
  amount: number,
): EnvironmentLightingProfile {
  const t = Math.min(1, Math.max(0, amount));
  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    background: blendHexColor(from.background, to.background, t),
    fogColor: blendHexColor(from.fogColor, to.fogColor, t),
    fogNear: lerp(from.fogNear, to.fogNear),
    fogFar: lerp(from.fogFar, to.fogFar),
    ambientIntensity: lerp(from.ambientIntensity, to.ambientIntensity),
    hemisphereIntensity: lerp(from.hemisphereIntensity, to.hemisphereIntensity),
    sunIntensity: lerp(from.sunIntensity, to.sunIntensity),
    sunColor: blendHexColor(from.sunColor, to.sunColor, t),
    sunPosition: [
      lerp(from.sunPosition[0], to.sunPosition[0]),
      lerp(from.sunPosition[1], to.sunPosition[1]),
      lerp(from.sunPosition[2], to.sunPosition[2]),
    ],
    exposure: lerp(from.exposure, to.exposure),
    shadowCameraBounds: lerp(from.shadowCameraBounds, to.shadowCameraBounds),
  };
}

export function getLightingTransition(
  from: LightingPreset,
  to: LightingPreset,
  amount: number,
): EnvironmentLightingProfile {
  return interpolateLightingProfiles(ENVIRONMENT_LIGHTING_PROFILES[from], ENVIRONMENT_LIGHTING_PROFILES[to], amount);
}
