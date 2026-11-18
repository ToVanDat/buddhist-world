import { describe, expect, it } from "vitest";
import { resolveLotusPondLayout } from "./LotusPondDetails";

describe("lotus pond visual layout", () => {
  it("scales decorative lotus density down for lower quality tiers", () => {
    const ultra = resolveLotusPondLayout("ULTRA");
    const high = resolveLotusPondLayout("HIGH");
    const medium = resolveLotusPondLayout("MEDIUM");
    const mobile = resolveLotusPondLayout("MOBILE");
    expect(ultra.leaves.length).toBeGreaterThan(high.leaves.length);
    expect(high.leaves.length).toBeGreaterThan(medium.leaves.length);
    expect(medium.leaves.length).toBeGreaterThan(mobile.leaves.length);
    expect(ultra.flowers.length).toBeGreaterThan(mobile.flowers.length);
  });

  it("keeps lotus placements inside the pond visual footprint", () => {
    const layout = resolveLotusPondLayout("ULTRA");
    for (const item of [...layout.leaves, ...layout.flowers]) {
      expect(Math.hypot(item.x, item.z)).toBeLessThan(7);
      expect(Number.isFinite(item.rotation)).toBe(true);
    }
  });
});
