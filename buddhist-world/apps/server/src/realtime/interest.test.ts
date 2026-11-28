import { describe, expect, it } from "vitest";
import { buildInterestIndex, findNearbyPlayers } from "./interest.js";

const player = (id: string, x: number, z: number) => ({ id, pos: [x, 0, z] as [number, number, number] });

describe("multiplayer spatial interest index", () => {
  it("finds players in neighboring cells inside the interest radius", () => {
    const a = player("a", 0, 0);
    const b = player("b", 70, 0);
    const index = buildInterestIndex([a, b]);
    expect(findNearbyPlayers(a, index).map((item) => item.id)).toEqual(["b"]);
  });

  it("excludes the current player and players outside the radius", () => {
    const a = player("a", 0, 0);
    const b = player("b", 81, 0);
    const index = buildInterestIndex([a, b]);
    expect(findNearbyPlayers(a, index)).toEqual([]);
  });

  it("handles negative world coordinates across cell boundaries", () => {
    const a = player("a", -79, -1);
    const b = player("b", -81, -1);
    const index = buildInterestIndex([a, b]);
    expect(findNearbyPlayers(a, index).map((item) => item.id)).toEqual(["b"]);
  });

  it("supports a custom cell size without missing candidates", () => {
    const a = player("a", 0, 0);
    const b = player("b", 150, 0);
    const index = buildInterestIndex([a, b], 40);
    expect(findNearbyPlayers(a, index, 160).map((item) => item.id)).toEqual(["b"]);
  });

  it("ignores players with non-finite coordinates when building the index", () => {
    const a = player("a", 0, 0);
    const invalid = { id: "invalid", pos: [Number.NaN, 0, 0] as [number, number, number] };
    const index = buildInterestIndex([a, invalid]);
    expect(findNearbyPlayers(a, index)).toEqual([]);
  });

  it("falls back to a safe cell size for invalid configuration", () => {
    const a = player("a", 0, 0);
    const b = player("b", 1, 1);
    const index = buildInterestIndex([a, b], Number.NaN);
    expect(Number.isFinite(index.cellSize)).toBe(true);
    expect(findNearbyPlayers(a, index)).toEqual([b]);
  });

  it("returns no nearby players for invalid query coordinates or radius", () => {
    const a = player("a", 0, 0);
    const b = player("b", 1, 1);
    const index = buildInterestIndex([a, b]);
    expect(findNearbyPlayers({ id: "bad", pos: [Number.POSITIVE_INFINITY, 0, 0] as [number, number, number] }, index)).toEqual([]);
    expect(findNearbyPlayers(a, index, Number.NaN)).toEqual([]);
    expect(findNearbyPlayers(a, index, -1)).toEqual([]);
  });

  it("returns no duplicate players", () => {
    const a = player("a", 0, 0);
    const b = player("b", 1, 1);
    const index = buildInterestIndex([a, b]);
    expect(findNearbyPlayers(a, index)).toHaveLength(1);
  });
});
