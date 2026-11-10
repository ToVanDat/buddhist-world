import type { EnvironmentLightingProfile } from "./LightingProfiles";
import type { WorldEnvironmentSnapshot } from "@bw/shared";

/** Applies lighting-only weather response; precipitation visuals are a separate renderer system. */
export function applyWeatherLighting(
  profile: EnvironmentLightingProfile,
  weather: WorldEnvironmentSnapshot["weather"],
  intensity: number,
): EnvironmentLightingProfile {
  const amount = Math.max(0, Math.min(1, intensity));
  const result = { ...profile, sunPosition: [...profile.sunPosition] as [number, number, number] };
  if (weather === "cloudy") {
    result.sunIntensity *= 1 - 0.42 * amount;
    result.ambientIntensity *= 1 + 0.12 * amount;
    result.fogFar *= 1 - 0.12 * amount;
  } else if (weather === "rain") {
    result.sunIntensity *= 1 - 0.58 * amount;
    result.ambientIntensity *= 1 - 0.08 * amount;
    result.fogFar *= 1 - 0.3 * amount;
  } else if (weather === "fog") {
    result.sunIntensity *= 1 - 0.25 * amount;
    result.fogNear *= 1 - 0.55 * amount;
    result.fogFar *= 1 - 0.62 * amount;
  }
  return result;
}
