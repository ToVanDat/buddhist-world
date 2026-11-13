import { describe, expect, it } from "vitest";
import { resolveWindStrength, sampleWindMotion } from "./WindSway";

describe("sampleWindMotion", () => {
  it("is deterministic for the same time and phase", () => {
    const input = { time: 12, amplitude: 0.05, stiffness: 2, intensity: 0.7, weather: "clear" as const, phase: 1.2 };
    expect(sampleWindMotion(input)).toEqual(sampleWindMotion(input));
  });

  it("retains a gentle ambient breeze in clear weather", () => {
    expect(resolveWindStrength("clear", 0)).toBeGreaterThan(0);
    const motion = sampleWindMotion({ time: 10, amplitude: 0.1, stiffness: 2, intensity: 0, weather: "clear" });
    expect(Math.abs(motion.rotationZ)).toBeGreaterThan(0);
  });

  it("increases wind strength under rain and stronger weather intensity", () => {
    expect(resolveWindStrength("rain", 0.8)).toBeGreaterThan(resolveWindStrength("clear", 0.8));
    expect(resolveWindStrength("rain", 1)).toBeGreaterThan(resolveWindStrength("rain", 0.2));
  });

  it("clamps intensity and stiffness to safe ranges", () => {
    expect(resolveWindStrength("rain", 5)).toBeLessThanOrEqual(1);
    expect(sampleWindMotion({ time: 1, amplitude: 0.05, stiffness: 100, intensity: 1, weather: "clear" }).response).toBe(8);
  });
});
