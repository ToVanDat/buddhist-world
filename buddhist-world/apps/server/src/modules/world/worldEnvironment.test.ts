import { describe, expect, it } from "vitest";
import { createWorldEnvironmentSnapshot, resolveWorldLightingBlend } from "./worldEnvironment.js";

describe("authoritative world environment", () => {
  it.each([
    [0, "night"], [300, "dawn"], [420, "day"], [1020, "sunset"], [1200, "night"],
  ] as const)("resolves minute %i to the expected lighting segment", (minute, preset) => {
    const blend = resolveWorldLightingBlend(minute);
    expect(blend.preset).toBe(preset);
  });

  it("returns a continuous transition amount within dawn", () => {
    const blend = resolveWorldLightingBlend(300);
    expect(blend.fromPreset).toBe("night");
    expect(blend.toPreset).toBe("dawn");
    expect(blend.transition).toBe(0.5);
  });

  it("rejects out-of-range world minutes", () => {
    expect(() => resolveWorldLightingBlend(1440)).toThrow(RangeError);
    expect(() => resolveWorldLightingBlend(-1)).toThrow(RangeError);
  });

  it("creates a validated Vietnam-local environment snapshot", () => {
    const snapshot = createWorldEnvironmentSnapshot(new Date("2026-11-10T00:00:00.000Z"), "rain", 0.7);
    expect(snapshot.worldMinute).toBe(420);
    expect(snapshot.preset).toBe("day");
    expect(snapshot.weather).toBe("rain");
    expect(snapshot.weatherIntensity).toBe(0.7);
  });

  it("rejects invalid weather intensity through the shared schema", () => {
    expect(() => createWorldEnvironmentSnapshot(new Date("2026-11-10T00:00:00.000Z"), "fog", 1.2)).toThrow();
  });
});
