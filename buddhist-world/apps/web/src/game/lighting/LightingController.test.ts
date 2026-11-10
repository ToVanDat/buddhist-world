import { describe, expect, it } from "vitest";
import { blendHexColor, getLightingTransition, interpolateLightingProfiles } from "./LightingController";
import { ENVIRONMENT_LIGHTING_PROFILES } from "./LightingProfiles";

describe("cinematic lighting profile interpolation", () => {
  it("returns the source and destination colors at transition boundaries", () => {
    expect(blendHexColor("#000000", "#ffffff", 0)).toBe("#000000");
    expect(blendHexColor("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("clamps interpolation amounts outside the supported range", () => {
    expect(blendHexColor("#000000", "#ffffff", -1)).toBe("#000000");
    expect(blendHexColor("#000000", "#ffffff", 2)).toBe("#ffffff");
  });

  it("rejects invalid color strings instead of silently producing invalid renderer state", () => {
    expect(() => blendHexColor("white", "#ffffff", 0.5)).toThrow("six-digit hex");
  });

  it("interpolates all numeric and positional lighting fields", () => {
    const middle = interpolateLightingProfiles(
      ENVIRONMENT_LIGHTING_PROFILES.dawn,
      ENVIRONMENT_LIGHTING_PROFILES.day,
      0.5,
    );
    expect(middle.sunIntensity).toBeCloseTo(2.55);
    expect(middle.sunPosition).toEqual([-2.5, 68.5, 50]);
    expect(middle.exposure).toBeCloseTo(1.025);
  });

  it("provides a deterministic dawn-to-night transition", () => {
    const dawn = getLightingTransition("dawn", "night", 0);
    const night = getLightingTransition("dawn", "night", 1);
    expect(dawn).toMatchObject(ENVIRONMENT_LIGHTING_PROFILES.dawn);
    expect(night.background).toBe(ENVIRONMENT_LIGHTING_PROFILES.night.background);
    expect(night.fogColor).toBe(ENVIRONMENT_LIGHTING_PROFILES.night.fogColor);
    expect(night.ambientIntensity).toBeCloseTo(ENVIRONMENT_LIGHTING_PROFILES.night.ambientIntensity);
    expect(night.sunIntensity).toBeCloseTo(ENVIRONMENT_LIGHTING_PROFILES.night.sunIntensity);
  });
});
