import { describe, expect, it } from "vitest";
import { shouldAcceptServerJoined } from "./regionJoinFence.js";

describe("shouldAcceptServerJoined", () => {
  it("accepts a valid acknowledgement for the requested region", () => {
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [1, 0, 2], yaw: 0.5,
    }, "temple_complex")).toBe(true);
  });

  it("rejects a delayed acknowledgement for another region", () => {
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [1, 0, 2], yaw: 0,
    }, "garden")).toBe(false);
  });

  it("rejects acknowledgements when no region is currently requested", () => {
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [1, 0, 2], yaw: 0,
    }, null)).toBe(false);
  });

  it("rejects spawn acknowledgements outside the requested region bounds", () => {
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [999, 0, 2], yaw: 0,
    }, "temple_complex")).toBe(false);
    expect(shouldAcceptServerJoined({
      regionId: "unknown-region", position: [0, 0, 0], yaw: 0,
    }, "unknown-region")).toBe(false);
  });

  it("rejects extreme yaw values", () => {
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [1, 0, 2], yaw: Number.MAX_VALUE,
    }, "temple_complex")).toBe(false);
  });

  it("rejects malformed payloads without throwing", () => {
    expect(shouldAcceptServerJoined(null, "temple_complex")).toBe(false);
    expect(shouldAcceptServerJoined({}, "temple_complex")).toBe(false);
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [1, 2], yaw: 0,
    }, "temple_complex")).toBe(false);
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [1, Number.NaN, 2], yaw: 0,
    }, "temple_complex")).toBe(false);
    expect(shouldAcceptServerJoined({
      regionId: "temple_complex", position: [1, 0, 2], yaw: Number.POSITIVE_INFINITY,
    }, "temple_complex")).toBe(false);
  });
});
