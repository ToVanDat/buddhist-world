import * as THREE from "three";
import type { EnvironmentLightingProfile } from "./LightingProfiles";
import type { WorldEnvironmentSnapshot } from "@bw/shared";

export interface WeatherWindVector {
  x: number;
  z: number;
  speed: number;
}

/** Deterministic prevailing wind by weather state; intensity scales gust strength. */
export function resolveWeatherWind(
  weather: WorldEnvironmentSnapshot["weather"],
  intensity: number,
): WeatherWindVector {
  const amount = THREE.MathUtils.clamp(intensity, 0, 1);
  const direction = weather === "rain"
    ? { x: 0.82, z: 0.57 }
    : weather === "cloudy"
      ? { x: 0.72, z: 0.69 }
      : weather === "fog"
        ? { x: 0.35, z: 0.94 }
        : { x: 0.94, z: 0.34 };
  const speed = weather === "rain" ? 2.2 + amount * 5.2
    : weather === "cloudy" ? 1.2 + amount * 2.2
      : weather === "fog" ? 0.5 + amount * 0.8
        : 0.8 + amount * 1.2;
  return { ...direction, speed };
}

/** Applies weather response to lighting and atmospheric fog, not precipitation geometry. */
export function applyWeatherLighting(
  profile: EnvironmentLightingProfile,
  weather: WorldEnvironmentSnapshot["weather"],
  intensity: number,
): EnvironmentLightingProfile {
  const amount = THREE.MathUtils.clamp(intensity, 0, 1);
  const result = { ...profile, sunPosition: [...profile.sunPosition] as [number, number, number] };
  const baseFog = new THREE.Color(profile.fogColor);
  if (weather === "cloudy") {
    result.sunIntensity *= 1 - 0.42 * amount;
    result.ambientIntensity *= 1 + 0.12 * amount;
    result.fogNear *= 0.94;
    result.fogFar *= 1 - 0.18 * amount;
    baseFog.lerp(new THREE.Color("#8999a5"), 0.24 * amount);
  } else if (weather === "rain") {
    result.sunIntensity *= 1 - 0.58 * amount;
    result.ambientIntensity *= 1 - 0.08 * amount;
    result.fogNear *= 1 - 0.12 * amount;
    result.fogFar *= 1 - 0.34 * amount;
    baseFog.lerp(new THREE.Color("#657b88"), 0.42 * amount);
  } else if (weather === "fog") {
    result.sunIntensity *= 1 - 0.25 * amount;
    result.fogNear *= 1 - 0.72 * amount;
    result.fogFar *= 1 - 0.78 * amount;
    baseFog.lerp(new THREE.Color("#aab8bd"), 0.68 * amount);
  }
  result.fogNear = Math.max(1, result.fogNear);
  result.fogFar = Math.max(result.fogNear + 8, result.fogFar);
  result.fogColor = `#${baseFog.getHexString()}`;
  return result;
}
