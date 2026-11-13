import { describe, expect, it } from "vitest";
import { resolveCinematicGrade } from "./CinematicGrade";

describe("cinematic grade", () => {
  it("uses restrained warm-neutral grading for cinematic desktop tiers", () => {
    const ultra = resolveCinematicGrade("ULTRA");
    const high = resolveCinematicGrade("HIGH");
    expect(ultra?.contrast).toBeGreaterThan(1);
    expect(ultra?.saturation).toBeGreaterThan(1);
    expect(ultra?.warmth).toBeGreaterThan(0);
    expect(high?.warmth).toBeLessThan(ultra!.warmth);
  });

  it("does not add a grading pass to performance tiers", () => {
    expect(resolveCinematicGrade("MEDIUM")).toBeNull();
    expect(resolveCinematicGrade("LOW")).toBeNull();
    expect(resolveCinematicGrade("MOBILE")).toBeNull();
  });
});
