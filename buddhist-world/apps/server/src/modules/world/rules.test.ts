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

  it("uses the supplied authoritative NPC schedule position", () => {\n    expect(isNearWorldInteraction([0, 1.2, -27], "temple_complex", "monk_guide", [0, 1.2, -27])).toBe(true);\n    expect(isNearWorldInteraction([8, 1.2, -17], "temple_complex", "monk_guide", [0, 1.2, -27])).toBe(false);\n  });\n\n  it("rejects unknown interaction targets", () => {
    expect(isNearWorldInteraction([0, 1.2, -24], "temple_complex", "unknown")).toBe(false);
  });
});
