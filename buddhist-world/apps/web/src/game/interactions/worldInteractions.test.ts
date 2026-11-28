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
  it("does not activate an interaction from a different floor", () => {
    expect(findNearbyWorldInteraction([5, 4, -19], "temple_complex")).toBeNull();
  });
  it("rejects interactions when the player is on a raised level above the target", () => {
    // Registry target is authored at Y=1.2; a player 1.5m higher is on another level.
    expect(findNearbyWorldInteraction([5, 2.7, -19], "temple_complex")).toBeNull();
  });
  it("keeps normal same-floor interaction reach", () => {
    expect(findNearbyWorldInteraction([5, 1.2, -19], "temple_complex")?.id).toBe("temple_bell");
  });
  it("rejects non-finite player coordinates instead of triggering nearby actions", () => {
    expect(findNearbyWorldInteraction([5, Number.NaN, -19], "temple_complex")).toBeNull();
    expect(findNearbyWorldInteraction([Number.POSITIVE_INFINITY, 1.2, -19], "temple_complex")).toBeNull();
    expect(findNearbyWorldInteraction([5, 1.2, Number.NaN], "temple_complex")).toBeNull();
  });
  it("ignores an NPC whose live snapshot contains non-finite coordinates", () => {
    const states = {
      monk_guide: {
        id: "monk_guide", name: "Guide", title: "Monk", active: true,
        state: {
          id: "prayer", startMinute: 300, endMinute: 420, regionId: "temple_complex",
          position: [0, Number.NaN, -27] as [number, number, number], activity: "pray" as const,
        },
        nextChangeMinute: 420,
      },
    };
    expect(findNearbyWorldInteraction([0, 1.2, -27], "temple_complex", states)?.id).not.toBe("monk_guide");
  });
  it("ignores an NPC snapshot assigned to a different region", () => {
    const states = {
      monk_guide: {
        id: "monk_guide", name: "Guide", title: "Monk", active: true,
        state: {
          id: "prayer", startMinute: 300, endMinute: 420, regionId: "mountain_path",
          position: [0, 1.2, -27] as [number, number, number], activity: "pray" as const,
        },
        nextChangeMinute: 420,
      },
    };
    expect(findNearbyWorldInteraction([0, 1.2, -27], "temple_complex", states)?.id).not.toBe("monk_guide");
  });
});
