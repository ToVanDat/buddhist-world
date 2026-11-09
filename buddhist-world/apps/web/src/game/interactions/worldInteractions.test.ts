import { describe, expect, it } from "vitest";
import { findNearbyWorldInteraction } from "./worldInteractions";

describe("world interaction registry lookup", () => {
  it("returns a nearby target in the requested region", () => {
    expect(findNearbyWorldInteraction([5, 1.2, -19], "temple_complex")?.id).toBe("temple_bell");
  });
  it("does not return targets from another region", () => {
    expect(findNearbyWorldInteraction([5, 1.2, -19], "unknown")).toBeNull();
  });
  it("rejects targets outside horizontal or vertical reach", () => {
    expect(findNearbyWorldInteraction([50, 1.2, -19], "temple_complex")).toBeNull();
    expect(findNearbyWorldInteraction([5, 9, -19], "temple_complex")).toBeNull();
  });
});
