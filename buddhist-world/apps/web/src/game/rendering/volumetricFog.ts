import type { Quality } from "./quality";

export type FogWeather = "clear" | "cloudy" | "rain" | "fog";

export interface VolumetricFogParameters {
  enabled: boolean;
  steps: number;
  density: number;
  color: string;
}

const STEP_BUDGET: Record<Quality, number> = {
  ULTRA: 16,
  HIGH: 8,
  MEDIUM: 0,
  LOW: 0,
  MOBILE: 0,
};

export function resolveVolumetricFogParameters(
  quality: Quality,
  weather: FogWeather,
  intensity: number,
): VolumetricFogParameters {
  const amount = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  const steps = STEP_BUDGET[quality];
  const weatherDensity = weather === "fog" ? 0.032 : weather === "rain" ? 0.016 : weather === "cloudy" ? 0.006 : 0;
  return {
    enabled: steps > 0 && weatherDensity > 0 && amount > 0.01,
    steps,
    density: weatherDensity * amount,
    color: weather === "fog" ? "#aeb8bd" : weather === "rain" ? "#778797" : "#a9b9c5",
  };
}
