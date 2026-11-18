import { describe, expect, it } from "vitest";
import { injectVertexWindShader, resolveVertexWindUniformState } from "./VertexWind";

describe("vertex wind", () => {
  it("injects bounded wind uniforms and vertex deformation into a standard vertex shader", () => {
    const source = "#include <common>\nvoid main() {\n#include <begin_vertex>\n}";
    const result = injectVertexWindShader(source);
    expect(result).toContain("uBwWindTime");
    expect(result).toContain("uBwWindDirection");
    expect(result).toContain("bwWindWeight");
    expect(result).toContain("transformed.x +=");
    expect(result).toContain("transformed.z +=");
  });

  it("leaves incompatible shader sources unchanged", () => {
    expect(injectVertexWindShader("void main() {}")).toBe("void main() {}");
  });

  it("normalizes wind direction and clamps intensity for every weather", () => {
    for (const weather of ["clear", "cloudy", "rain", "fog"] as const) {
      const state = resolveVertexWindUniformState(weather, 3, 2);
      expect(Math.hypot(state.directionX, state.directionZ)).toBeCloseTo(1);
      expect(state.strength).toBeGreaterThanOrEqual(0);
      expect(state.strength).toBeLessThanOrEqual(1);
      expect(state.time).toBe(2);
    }
  });

  it("sanitizes non-finite time", () => {
    expect(resolveVertexWindUniformState("clear", 0.5, Number.NaN).time).toBe(0);
  });
});
