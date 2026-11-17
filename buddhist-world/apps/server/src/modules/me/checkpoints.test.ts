import { describe, expect, it } from "vitest";
import { isNearCheckpoint, isOwnedFreshPresence } from "./checkpoints.js";

describe("isNearCheckpoint", () => {
  const spawn: [number, number, number] = [0, 1.2, 20];

  it("accepts a player within the checkpoint radius in the same region", () => {
    expect(isNearCheckpoint([3, 1.2, 20], "temple_complex", "temple_complex", spawn)).toBe(true);
  });

  it("rejects a player outside the horizontal checkpoint radius", () => {
    expect(isNearCheckpoint([4.6, 1.2, 20], "temple_complex", "temple_complex", spawn)).toBe(false);
  });

  it("rejects a checkpoint in a different region", () => {
    expect(isNearCheckpoint([0, 1.2, 20], "temple_complex", "mountain_garden", spawn)).toBe(false);
  });

  it("rejects excessive vertical separation", () => {
    expect(isNearCheckpoint([0, 5, 20], "temple_complex", "temple_complex", spawn)).toBe(false);
  });

  it("rejects invalid position coordinates", () => {
    expect(isNearCheckpoint([Number.NaN, 1.2, 20], "temple_complex", "temple_complex", spawn)).toBe(false);
  });
});


describe("isFreshPresenceTimestamp", () => {
  it("accepts a recent heartbeat", async () => {
    const { isFreshPresenceTimestamp } = await import("./checkpoints.js");
    expect(isFreshPresenceTimestamp(95_000, 100_000)).toBe(true);
  });

  it("rejects stale, future-skewed and invalid timestamps", async () => {
    const { isFreshPresenceTimestamp } = await import("./checkpoints.js");
    expect(isFreshPresenceTimestamp(60_000, 100_000)).toBe(false);
    expect(isFreshPresenceTimestamp(106_000, 100_000)).toBe(false);
    expect(isFreshPresenceTimestamp(Number.NaN, 100_000)).toBe(false);
  });
});


describe("isOwnedFreshPresence", () => {
  const presence = { ownerToken: "socket-owner-a", heartbeatAt: "95000", region: "temple_complex", x: "1", y: "1.2", z: "20" };

  it("accepts a fresh heartbeat owned by the current socket lease", () => {
    expect(isOwnedFreshPresence(presence, "socket-owner-a", 100_000)).toBe(true);
  });

  it("rejects a replaced, missing or stale socket lease", () => {
    expect(isOwnedFreshPresence(presence, "socket-owner-b", 100_000)).toBe(false);
    expect(isOwnedFreshPresence(presence, null, 100_000)).toBe(false);
    expect(isOwnedFreshPresence({ ...presence, heartbeatAt: "60000" }, "socket-owner-a", 100_000)).toBe(false);
    expect(isOwnedFreshPresence({ ...presence, x: "NaN" }, "socket-owner-a", 100_000)).toBe(false);
    expect(isOwnedFreshPresence({ ...presence, region: "" }, "socket-owner-a", 100_000)).toBe(false);
  });
});


describe("isPresenceLeaseCurrent", () => {
  it("rejects presence from a replaced or missing socket lease", async () => {
    const { isPresenceLeaseCurrent } = await import("./checkpoints.js");
    const presence = { ownerToken: "owner-a" };
    expect(isPresenceLeaseCurrent(presence, "owner-a")).toBe(true);
    expect(isPresenceLeaseCurrent(presence, "owner-b")).toBe(false);
    expect(isPresenceLeaseCurrent(presence, null)).toBe(false);
    expect(isPresenceLeaseCurrent({}, "owner-a")).toBe(false);
  });
});
