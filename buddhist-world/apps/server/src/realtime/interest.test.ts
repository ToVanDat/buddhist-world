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

  it("returns no duplicate players", () => {
    const a = player("a", 0, 0);
    const b = player("b", 1, 1);
    const index = buildInterestIndex([a, b]);
    expect(findNearbyPlayers(a, index)).toHaveLength(1);
  });
});
