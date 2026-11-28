import { describe, expect, it } from "vitest";
import { shouldAcceptServerJoined } from "./regionJoinFence.js";

describe("shouldAcceptServerJoined", () => {
  it("accepts the exact region requested by this connection", () => {
    expect(shouldAcceptServerJoined("temple_complex", "temple_complex")).toBe(true);
  });

  it("rejects a delayed join acknowledgement for another region", () => {
    expect(shouldAcceptServerJoined("temple_complex", "garden")).toBe(false);
  });

  it("rejects acknowledgements when no region is currently requested", () => {
    expect(shouldAcceptServerJoined("temple_complex", null)).toBe(false);
  });

  it("rejects malformed region identifiers", () => {
    expect(shouldAcceptServerJoined(undefined, "temple_complex")).toBe(false);
    expect(shouldAcceptServerJoined(42, "temple_complex")).toBe(false);
  });
});
