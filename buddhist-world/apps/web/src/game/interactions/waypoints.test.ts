import { describe, expect, it } from "vitest";
import { REGIONS } from "@bw/shared";
import { getWaypointDistance } from "./waypoints";

const target = REGIONS.temple_complex!.spawns.find((spawn) => spawn.id === "lotus_pond")!;

describe("waypoint distance", () => {
  it("returns horizontal distance to a temple landmark", () => {
    expect(getWaypointDistance([-18, 20, 13], target)).toBe(0);
    expect(getWaypointDistance([-15, 999, 17], target)).toBe(5);
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
    expect(getWaypointRelativeBearing([-18, 1.2, 10], target, 0)).toBeCloseTo(0);
  });

  it("returns a positive quarter turn when the target is to the right", async () => {
    const { getWaypointRelativeBearing } = await import("./waypoints");
    expect(getWaypointRelativeBearing([-19, 1.2, 13], target, 0)).toBeCloseTo(Math.PI / 2);
  });

  it("returns null when position or heading is invalid", async () => {
    const { getWaypointRelativeBearing } = await import("./waypoints");
    expect(getWaypointRelativeBearing(null, target, 0)).toBeNull();
    expect(getWaypointRelativeBearing([0, 0, 0], target, Number.NaN)).toBeNull();
  });
});

describe("visitor tour progression", () => {
  it("starts at the first landmark and advances in manifest order", async () => {
    const { getNextWaypointId } = await import("./waypoints");
    const stops = [{ id: "gate" }, { id: "courtyard" }, { id: "hall" }];
    expect(getNextWaypointId(stops, null)).toBe("gate");
    expect(getNextWaypointId(stops, "gate")).toBe("courtyard");
    expect(getNextWaypointId(stops, "courtyard")).toBe("hall");
  });

  it("wraps after the last landmark and safely handles an empty region", async () => {
    const { getNextWaypointId } = await import("./waypoints");
    const stops = [{ id: "gate" }, { id: "hall" }];
    expect(getNextWaypointId(stops, "hall")).toBe("gate");
    expect(getNextWaypointId([], null)).toBeNull();
  });

  it("restores only unique landmark IDs known to the active region", async () => {
    const { getVisitedWaypointIds } = await import("./waypoints");
    const stops = [{ id: "gate" }, { id: "hall" }];
    expect(getVisitedWaypointIds(["gate", "gate", "unknown", 42], stops)).toEqual(["gate"]);
    expect(getVisitedWaypointIds("not-an-array", stops)).toEqual([]);
  });

  it("selects the first unvisited stop and reports completion", async () => {
    const { getNextUnvisitedWaypointId, getVisitorTourProgress } = await import("./waypoints");
    const stops = [{ id: "gate" }, { id: "courtyard" }, { id: "hall" }];
    expect(getNextUnvisitedWaypointId(stops, ["gate"])).toBe("courtyard");
    expect(getVisitorTourProgress(stops, ["gate", "gate", "unknown"])).toEqual({ visited: 1, total: 3, complete: false });
    expect(getVisitorTourProgress(stops, ["gate", "courtyard", "hall"])).toEqual({ visited: 3, total: 3, complete: true });
    expect(getNextUnvisitedWaypointId([], [])).toBeNull();
  });
});
