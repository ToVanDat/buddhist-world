import { describe, expect, it } from "vitest";
import { ENVIRONMENT_LIGHTING_PROFILES } from "./LightingProfiles";
import { shouldRenderAtmosphericSky } from "./SkyAtmosphere";

describe("atmospheric sky visibility", () => {
  it("keeps the procedural sky enabled for daytime and twilight profiles", () => {
    expect(shouldRenderAtmosphericSky(ENVIRONMENT_LIGHTING_PROFILES.dawn)).toBe(true);
    expect(shouldRenderAtmosphericSky(ENVIRONMENT_LIGHTING_PROFILES.day)).toBe(true);
    expect(shouldRenderAtmosphericSky(ENVIRONMENT_LIGHTING_PROFILES.sunset)).toBe(true);
  });

  it("falls back to the scene background for the night profile", () => {
    expect(shouldRenderAtmosphericSky(ENVIRONMENT_LIGHTING_PROFILES.night)).toBe(false);
  });

  it("respects quality settings that disable the sky", () => {
    expect(shouldRenderAtmosphericSky(ENVIRONMENT_LIGHTING_PROFILES.day, false)).toBe(false);
  });
});
