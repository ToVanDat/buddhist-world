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

  it("rejects corrections for older or not-yet-sent movement updates", () => {
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 13)).toBe(false);
    expect(shouldAcceptServerCorrection(valid, "temple_complex", 11)).toBe(false);
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
