import { describe, expect, it } from "vitest";
import { findNearbyCheckpoint } from "./checkpoints";

describe("temple checkpoint proximity", () => {
  it("finds the entrance checkpoint inside the interaction radius", () => {
    expect(findNearbyCheckpoint([1, 1, 40])?.id).toBe("main_entrance");
  });

  it("returns the nearest checkpoint when interaction zones overlap", () => {
    expect(findNearbyCheckpoint([0, 1, 2])?.id).toBe("courtyard");
  });

  it("does not expose a prompt when the player is outside every checkpoint radius", () => {
    expect(findNearbyCheckpoint([70, 1, 70])).toBeNull();
  });

  it("places the lotus pond checkpoint on the shore", () => {
    expect(findNearbyCheckpoint([-26, 1, 4])?.id).toBe("lotus_pond");
  });
});
