import { describe, expect, it } from "vitest";
import { isInsideLotusPondFootprint, validateTempleSpawnSafety } from "@bw/shared";

describe("lotus pond footprint", () => {
  it("accepts points inside the visible circular water surface", () => {
    expect(isInsideLotusPondFootprint([-18, 0, 4])).toBe(true);
    expect(isInsideLotusPondFootprint([-11, 0, 4])).toBe(true);
  });

  it("rejects square-corner points outside the circular water surface", () => {
    expect(isInsideLotusPondFootprint([-25, 0, 11])).toBe(false);
  });

  it("applies spawn clearance radially around the pond", () => {
    expect(isInsideLotusPondFootprint([-18, 1.2, 12], 1.5)).toBe(true);
    expect(isInsideLotusPondFootprint([-18, 1.2, 13], 1.5)).toBe(false);
  });

  it("rejects invalid positions and margins", () => {
    expect(isInsideLotusPondFootprint([Number.NaN, 0, 4])).toBe(false);
    expect(isInsideLotusPondFootprint([-18, 0, 4], -1)).toBe(false);
  });

  it("uses the same circular safety envelope when validating spawn points", () => {
    expect(validateTempleSpawnSafety([
      { id: "pond-edge", position: [-18, 1.2, 12] },
      { id: "north-bank", position: [-18, 1.2, 13] },
    ])).toEqual(['spawn "pond-edge" overlaps the lotus pond safety envelope']);
  });
});
