import { describe, expect, it } from "vitest";
import { ENVIRONMENT_LIGHTING_PROFILES } from "./LightingProfiles";
import { applyWeatherLighting, interpolateLightingProfile, resolveWeatherWind } from "./WeatherLighting";

describe("weather lighting response", () => {
  it("leaves clear weather unchanged", () => {
    expect(applyWeatherLighting(ENVIRONMENT_LIGHTING_PROFILES.day, "clear", 1))
      .toEqual(ENVIRONMENT_LIGHTING_PROFILES.day);
  });

  it("reduces direct sun and cools fog under rain without mutating source", () => {
    const source = ENVIRONMENT_LIGHTING_PROFILES.day;
    const result = applyWeatherLighting(source, "rain", 0.8);
    expect(result.sunIntensity).toBeLessThan(source.sunIntensity);
    expect(result.fogFar).toBeLessThan(source.fogFar);
    expect(result.fogColor).not.toBe(source.fogColor);
    expect(source.sunIntensity).toBe(3);
  });

  it("increases atmospheric density under fog and clamps intensity", () => {
    const profile = ENVIRONMENT_LIGHTING_PROFILES.day;
    const dense = applyWeatherLighting(profile, "fog", 1);
    expect(dense.fogNear).toBeLessThan(profile.fogNear);
    expect(dense.fogFar).toBeLessThan(profile.fogFar);
    expect(applyWeatherLighting(profile, "fog", 4)).toEqual(dense);
  });

  it("keeps a deterministic prevailing wind with weather-scaled speed", () => {
    expect(resolveWeatherWind("rain", 1)).toEqual(resolveWeatherWind("rain", 1));
    expect(resolveWeatherWind("rain", 1).speed).toBeGreaterThan(resolveWeatherWind("clear", 1).speed);
  });

  it("smoothly interpolates all lighting channels without mutating inputs", () => {
    const from = ENVIRONMENT_LIGHTING_PROFILES.day;
    const to = ENVIRONMENT_LIGHTING_PROFILES.night;
    const halfway = interpolateLightingProfile(from, to, 0.05);
    expect(halfway.sunIntensity).toBeLessThan(from.sunIntensity);
    expect(halfway.sunIntensity).toBeGreaterThan(to.sunIntensity);
    expect(halfway.sunPosition).not.toEqual(from.sunPosition);
    expect(from.sunIntensity).toBe(3);
  });
});
