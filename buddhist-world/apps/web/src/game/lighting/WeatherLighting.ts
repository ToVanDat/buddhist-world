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
  const amount = Number.isFinite(intensity) ? THREE.MathUtils.clamp(intensity, 0, 1) : 0;
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
  const amount = Number.isFinite(intensity) ? THREE.MathUtils.clamp(intensity, 0, 1) : 0;
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

/** Frame-rate-independent smoothing for authoritative time/weather snapshot changes. */
export function interpolateLightingProfile(
  current: EnvironmentLightingProfile,
  target: EnvironmentLightingProfile,
  deltaSeconds: number,
  response = 1.8,
): EnvironmentLightingProfile {
  const alpha = 1 - Math.exp(-Math.max(0, Math.min(deltaSeconds, 0.1)) * Math.max(0.1, response));
  const mix = (a: number, b: number) => THREE.MathUtils.lerp(a, b, alpha);
  const mixColor = (a: string, b: string) =>
    `#${new THREE.Color(a).lerp(new THREE.Color(b), alpha).getHexString()}`;
  return {
    background: mixColor(current.background, target.background),
    fogColor: mixColor(current.fogColor, target.fogColor),
    fogNear: mix(current.fogNear, target.fogNear),
    fogFar: mix(current.fogFar, target.fogFar),
    ambientIntensity: mix(current.ambientIntensity, target.ambientIntensity),
    hemisphereIntensity: mix(current.hemisphereIntensity, target.hemisphereIntensity),
    sunIntensity: mix(current.sunIntensity, target.sunIntensity),
    sunColor: mixColor(current.sunColor, target.sunColor),
    sunPosition: [
      mix(current.sunPosition[0], target.sunPosition[0]),
      mix(current.sunPosition[1], target.sunPosition[1]),
      mix(current.sunPosition[2], target.sunPosition[2]),
    ],
    exposure: mix(current.exposure, target.exposure),
    shadowCameraBounds: mix(current.shadowCameraBounds, target.shadowCameraBounds),
  };
}
