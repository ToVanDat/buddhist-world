import { describe, expect, it } from "vitest";
import { sampleWindMotion } from "./WindSway";

describe("sampleWindMotion", () => {
  it("is deterministic for the same time and phase", () => {
    const input = { time: 12, amplitude: 0.05, stiffness: 2, intensity: 0.7, weather: "clear" as const, phase: 1.2 };
    expect(sampleWindMotion(input)).toEqual(sampleWindMotion(input));
  });

  it("does not move foliage when weather intensity is zero", () => {
    const motion = sampleWindMotion({ time: 10, amplitude: 0.1, stiffness: 2, intensity: 0, weather: "rain" });
    expect(motion.rotationX).toBe(0);
    expect(motion.rotationZ).toBe(0);
  });

  it("increases sway under rain compared with calm clear weather", () => {
    const base = { time: 4, amplitude: 0.05, stiffness: 2, intensity: 0.8, phase: 0 };
    const clear = sampleWindMotion({ ...base, weather: "clear" });
    const rain = sampleWindMotion({ ...base, weather: "rain" });
    expect(Math.abs(rain.rotationZ)).toBeGreaterThan(Math.abs(clear.rotationZ));
  });

  it("clamps stiffness to a safe response range", () => {
    expect(sampleWindMotion({ time: 1, amplitude: 0.05, stiffness: 100, intensity: 1, weather: "clear" }).response).toBe(8);
  });
});
