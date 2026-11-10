import { describe, expect, it } from "vitest";
import { getWorldClockMinute } from "./worldClock.js";

describe("Vietnam world clock", () => {
  it("does not depend on the host timezone", () => {
    expect(getWorldClockMinute(new Date("2026-11-10T00:00:00.000Z"))).toBe(420);
    expect(getWorldClockMinute(new Date("2026-11-09T22:30:00.000Z"))).toBe(330);
  });

  it("rejects invalid dates", () => {
    expect(() => getWorldClockMinute(new Date(Number.NaN))).toThrow(RangeError);
  });
});
