import { describe, expect, it } from "vitest";
import { ENVIRONMENT_LIGHTING_PROFILES } from "./LightingProfiles";
import { applyWeatherLighting } from "./WeatherLighting";

describe("weather lighting response", () => {
  it("leaves clear weather unchanged", () => {
    expect(applyWeatherLighting(ENVIRONMENT_LIGHTING_PROFILES.day, "clear", 1))
      .toEqual(ENVIRONMENT_LIGHTING_PROFILES.day);
  });

  it("reduces direct sun under rain without mutating the source profile", () => {
    const source = ENVIRONMENT_LIGHTING_PROFILES.day;
    const result = applyWeatherLighting(source, "rain", 0.8);
    expect(result.sunIntensity).toBeLessThan(source.sunIntensity);
    expect(source.sunIntensity).toBe(3);
  });

  it("reduces fog distance for fog weather and clamps intensity", () => {
    const profile = ENVIRONMENT_LIGHTING_PROFILES.day;
    expect(applyWeatherLighting(profile, "fog", 1).fogFar).toBeLessThan(profile.fogFar);
    expect(applyWeatherLighting(profile, "fog", 4)).toEqual(applyWeatherLighting(profile, "fog", 1));
  });
});
