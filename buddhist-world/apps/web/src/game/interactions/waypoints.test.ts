import { describe, expect, it } from "vitest";
import { REGIONS } from "@bw/shared";
import { getWaypointDistance } from "./waypoints";

const target = REGIONS.temple_complex!.spawns.find((spawn) => spawn.id === "lotus_pond")!;

describe("waypoint distance", () => {
  it("returns horizontal distance to a temple landmark", () => {
    expect(getWaypointDistance([-18, 20, 4], target)).toBe(0);
    expect(getWaypointDistance([-15, 999, 8], target)).toBe(5);
  });
  it("returns null until the player position is available", () => {
    expect(getWaypointDistance(null, target)).toBeNull();
  });
  it("rejects non-finite player positions", () => {
    expect(getWaypointDistance([Number.NaN, 0, 0], target)).toBeNull();
  });
});
