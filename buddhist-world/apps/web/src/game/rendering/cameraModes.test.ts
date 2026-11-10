import { describe, expect, it } from "vitest";
import { CAMERA_MODE_PROFILES, resolveCameraDistance } from "./cameraModes";

describe("cinematic camera modes", () => {
  it("keeps gameplay camera distance user-controlled", () => {
    expect(resolveCameraDistance("gameplay", 7)).toBe(7);
  });
  it("provides wider minimum framing for cinematic and photo modes", () => {
    expect(resolveCameraDistance("cinematic", 5)).toBe(9);
    expect(resolveCameraDistance("photo", 5)).toBe(12);
  });
  it("keeps photo framing narrower than gameplay", () => {
    expect(CAMERA_MODE_PROFILES.photo.fov).toBeLessThan(CAMERA_MODE_PROFILES.gameplay.fov);
  });
});
