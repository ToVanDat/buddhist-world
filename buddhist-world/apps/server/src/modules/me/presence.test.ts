import { describe, expect, it } from "vitest";
import { parseOwnedPresenceSnapshot } from "./presence.js";

const valid = [
  "owner-a", "7",
  "ownerToken", "owner-a",
  "region", "temple_complex",
  "heartbeatAt", "100000",
  "x", "0",
  "y", "1.2",
  "z", "20",
];

describe("parseOwnedPresenceSnapshot", () => {
  it("accepts an atomic snapshot whose owner token, epoch and presence match", () => {
    expect(parseOwnedPresenceSnapshot(valid, 100_000)).toEqual({
      ownerToken: "owner-a",
      ownerEpoch: 7,
      presence: {
        ownerToken: "owner-a",
        region: "temple_complex",
        heartbeatAt: "100000",
        x: "0",
        y: "1.2",
        z: "20",
      },
    });
  });

  it("rejects a presence from a replaced lease", () => {
    const replaced = [...valid];
    replaced[3] = "owner-old";
    expect(parseOwnedPresenceSnapshot(replaced, 100_000)).toBeNull();
  });

  it("rejects missing, invalid or stale fencing epochs and heartbeats", () => {
    expect(parseOwnedPresenceSnapshot([], 100_000)).toBeNull();
    expect(parseOwnedPresenceSnapshot(["owner-a", "0", ...valid.slice(2)], 100_000)).toBeNull();
    expect(parseOwnedPresenceSnapshot(["owner-a", "not-an-epoch", ...valid.slice(2)], 100_000)).toBeNull();
    const stale = [...valid];
    stale[7] = "1";
    expect(parseOwnedPresenceSnapshot(stale, 100_000)).toBeNull();
  });
});
