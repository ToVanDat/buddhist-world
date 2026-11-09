import { describe, expect, it } from "vitest";
import { isNearWorldInteraction } from "./rules.js";

describe("isNearWorldInteraction", () => {
  it("accepts a player inside the interaction radius", () => {
    expect(isNearWorldInteraction([0, 1.2, -24], "temple_complex", "incense_burner")).toBe(true);
  });

  it("rejects players outside the horizontal radius", () => {
    expect(isNearWorldInteraction([4, 1.2, -24], "temple_complex", "incense_burner")).toBe(false);
  });

  it("rejects vertical separation and wrong regions", () => {
    expect(isNearWorldInteraction([0, 8, -24], "temple_complex", "incense_burner")).toBe(false);
    expect(isNearWorldInteraction([0, 1.2, -24], "other_region", "incense_burner")).toBe(false);
  });

  it("rejects unknown interaction targets", () => {
    expect(isNearWorldInteraction([0, 1.2, -24], "temple_complex", "unknown")).toBe(false);
  });
});
