import * as THREE from "three";
import type { WorldEnvironmentSnapshot } from "@bw/shared";
import { resolveWeatherWind } from "./WeatherLighting";

export type WindWeather = WorldEnvironmentSnapshot["weather"];

export interface WindFieldSample {
  time: number;
  directionX: number;
  directionZ: number;
  speed: number;
  strength: number;
  gust: number;
  turbulence: number;
}

/**
 * Authoritative deterministic world-wind sample.
 *
 * Every visual/physical receiver derives its response from this same field
 * contract instead of inventing its own weather-to-wind mapping.
 */
export function resolveWindField(
  weather: WindWeather,
  intensity: number,
  time: number,
): WindFieldSample {
  const amount = THREE.MathUtils.clamp(Number.isFinite(intensity) ? intensity : 0, 0, 1);
  const safeTime = Number.isFinite(time) ? time : 0;
  const prevailing = resolveWeatherWind(weather, amount);
  const directionLength = Math.hypot(prevailing.x, prevailing.z) || 1;
  const weatherScale = weather === "rain" ? 1
    : weather === "cloudy" ? 0.72
      : weather === "fog" ? 0.38
        : 0.58;
  const strength = THREE.MathUtils.clamp((0.18 + amount * 0.82) * weatherScale, 0, 1);
  const gustEnvelope = 0.5 + 0.5 * Math.sin(safeTime * 0.19);
  const gust = Math.sin(safeTime * 1.47) * 0.32 * gustEnvelope;
  const turbulence = Math.sin(safeTime * 3.1) * 0.1;

  return {
    time: safeTime,
    directionX: prevailing.x / directionLength,
    directionZ: prevailing.z / directionLength,
    speed: prevailing.speed,
    strength,
    gust,
    turbulence,
  };
}

/** Receiver-specific deformation scalar sampled from the shared field. */
export function sampleWindResponse(
  field: WindFieldSample,
  phase: number,
  weight: number,
  stiffness = 1,
): number {
  const safeWeight = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
  if (safeWeight === 0) return 0;
  const safeStiffness = THREE.MathUtils.clamp(Number.isFinite(stiffness) ? stiffness : 1, 0.1, 12);
  const slow = Math.sin(field.time * 0.62 + phase) * 0.58;
  const fastGust = Math.sin(field.time * 1.83 + phase * 1.7) * field.gust;
  const fine = Math.sin(field.time * 3.7 + phase * 2.3) * field.turbulence;
  return (slow + fastGust + fine) * field.strength * safeWeight / Math.sqrt(safeStiffness);
}
