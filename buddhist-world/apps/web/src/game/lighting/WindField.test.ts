import { describe, expect, it } from "vitest";
import { resolveWindField, sampleWindResponse } from "./WindField";

describe("shared wind field", () => {
  it("returns a normalized world-space direction for every weather state", () => {
    for (const weather of ["clear", "cloudy", "rain", "fog"] as const) {
      const field = resolveWindField(weather, 0.65, 12);
      expect(Math.hypot(field.directionX, field.directionZ)).toBeCloseTo(1);
      expect(field.speed).toBeGreaterThan(0);
      expect(field.strength).toBeGreaterThanOrEqual(0);
      expect(field.strength).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic and sanitizes non-finite inputs", () => {
    const input = resolveWindField("rain", 0.7, 8.5);
    expect(resolveWindField("rain", 0.7, 8.5)).toEqual(input);
    expect(resolveWindField("clear", Number.NaN, Number.NaN)).toEqual(
      resolveWindField("clear", 0, 0),
    );
  });

  it("makes rainy high-intensity weather stronger than a calm clear field", () => {
    expect(resolveWindField("rain", 1, 4).strength)
      .toBeGreaterThan(resolveWindField("clear", 0, 4).strength);
  });

  it("provides stable receiver response and zero response for zero weight", () => {
    const field = resolveWindField("cloudy", 0.8, 5);
    expect(sampleWindResponse(field, 0.4, 0.6, 2))
      .toBe(sampleWindResponse(field, 0.4, 0.6, 2));
    expect(sampleWindResponse(field, 0.4, 0, 2)).toBe(0);
  });
});
