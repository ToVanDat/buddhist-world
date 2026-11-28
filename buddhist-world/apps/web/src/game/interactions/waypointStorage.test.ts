import { describe, expect, it } from "vitest";
import { parseStoredWaypointId, waypointStorageKey } from "./waypointStorage";

const spawns = [{ id: "tam_quan" }, { id: "main_hall" }];

describe("waypoint persistence", () => {
  it("uses an isolated storage key for each region", () => {
    expect(waypointStorageKey("temple_complex")).toBe("bw.world.waypoint.v1:temple_complex");
    expect(waypointStorageKey("quiet-garden/upper")).toBe("bw.world.waypoint.v1:quiet-garden%2Fupper");
  });

  it("restores only known landmarks from the active region", () => {
    expect(parseStoredWaypointId("main_hall", spawns)).toBe("main_hall");
    expect(parseStoredWaypointId("unknown_landmark", spawns)).toBeNull();
    expect(parseStoredWaypointId("tam_quan", [{ id: "other_region_spawn" }])).toBeNull();
  });

  it("rejects empty, oversized, and absent storage values", () => {
    expect(parseStoredWaypointId(null, spawns)).toBeNull();
    expect(parseStoredWaypointId("", spawns)).toBeNull();
    expect(parseStoredWaypointId("x".repeat(129), spawns)).toBeNull();
  });
});
