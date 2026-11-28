import { describe, expect, it } from "vitest";
import { shouldAcceptServerCorrection } from "./serverCorrectionFence.js";

describe("shouldAcceptServerCorrection", () => {
  const valid = { regionId: "temple_complex", position: [1, 0, 2], seq: 12 };

  it("accepts a correction for the active region and a sent movement update", () => {
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 12)).toBe(true);
  });

  it("rejects a correction from a previous region", () => {
    expect(shouldAcceptServerCorrection(valid, "garden", 12)).toBe(false);
  });

  it("accepts a delayed correction for an already-sent update", () => {
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 13)).toBe(true);
  });

  it("rejects corrections for updates that have not been sent, are too stale, or were already superseded", () => {
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 11)).toBe(false);
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 23)).toBe(false);
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 13, 12)).toBe(false);
  });

  it("accepts delayed corrections within the bounded ten-update window", () => {
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 22)).toBe(true);
  });

  it("accepts corrections only in increasing sequence order", () => {
    const newer = { ...valid, seq: 14 };
    expect(shouldAcceptServerCorrection(newer, "temple_complex", 15, 12)).toBe(true);
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 15, 14)).toBe(false);
  });

  it("rejects malformed positions and sequence values", () => {
    expect(shouldAcceptServerCorrection({ ...valid, position: [1, 2] }, "temple_complex", 12)).toBe(false);
    expect(shouldAcceptServerCorrection({ ...valid, position: [1, Number.NaN, 2] }, "temple_complex", 12)).toBe(false);
    expect(shouldAcceptServerCorrection({ ...valid, seq: 1.5 }, "temple_complex", 12)).toBe(false);
    expect(shouldAcceptServerCorrection(null, "temple_complex", 12)).toBe(false);
  });

  it("rejects corrections when there is no active region", () => {
    expect(shouldAcceptServerCorrection(valid, null, 12)).toBe(false);
  });
});
