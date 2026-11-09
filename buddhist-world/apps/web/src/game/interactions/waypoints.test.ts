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


describe("waypoint bearing", () => {
  it("returns zero when the target is directly ahead", async () => {
    const { getWaypointRelativeBearing } = await import("./waypoints");
    expect(getWaypointRelativeBearing([-18, 1.2, 10], target, Math.PI)).toBeCloseTo(0);
  });

  it("returns a positive quarter turn when the target is to the right", async () => {
    const { getWaypointRelativeBearing } = await import("./waypoints");
    expect(getWaypointRelativeBearing([-19, 1.2, 4], target, 0)).toBeCloseTo(Math.PI / 2);
  });

  it("returns null when position or heading is invalid", async () => {
    const { getWaypointRelativeBearing } = await import("./waypoints");
    expect(getWaypointRelativeBearing(null, target, 0)).toBeNull();
    expect(getWaypointRelativeBearing([0, 0, 0], target, Number.NaN)).toBeNull();
  });
});
