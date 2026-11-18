import { describe, expect, it } from "vitest";
import { findNearbyWorldInteraction } from "./worldInteractions";

describe("world interaction registry lookup", () => {
  it("returns a nearby target in the requested region", () => {
    expect(findNearbyWorldInteraction([5, 1.2, -19], "temple_complex")?.id).toBe("temple_bell");
  });
  it("uses the latest server NPC position for proximity", () => {
    const states = {
      monk_guide: {
        id: "monk_guide", name: "Guide", title: "Monk", active: true,
        state: {
          id: "prayer", startMinute: 300, endMinute: 420, regionId: "temple_complex",
          position: [0, 1.2, -27] as [number, number, number], activity: "pray" as const,
        },
        nextChangeMinute: 420,
      },
    };
    expect(findNearbyWorldInteraction([0, 1.2, -27], "temple_complex", states)?.id).toBe("monk_guide");
    expect(findNearbyWorldInteraction([8, 1.2, -17], "temple_complex", states)?.id).not.toBe("monk_guide");
  });
  it("does not return targets from another region", () => {
    expect(findNearbyWorldInteraction([5, 1.2, -19], "unknown")).toBeNull();
  });
  it("rejects targets outside horizontal or vertical reach", () => {
    expect(findNearbyWorldInteraction([50, 1.2, -19], "temple_complex")).toBeNull();
    expect(findNearbyWorldInteraction([5, 9, -19], "temple_complex")).toBeNull();
  });
});
