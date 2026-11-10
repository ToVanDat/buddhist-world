import { describe, expect, it } from "vitest";
import { classifyBranchWindBone, resolveBranchBoneWind } from "./BranchBoneWind";

describe("branch-bone wind", () => {
  it("keeps trunk/root bones stiff and nearly fixed", () => {
    const trunk = classifyBranchWindBone("Tree_Trunk");
    const root = classifyBranchWindBone("root");
    const compoundRoot = classifyBranchWindBone("TreeRoot");
    expect(trunk.weight).toBeLessThan(0.1);
    expect(trunk.stiffness).toBeGreaterThan(6);
    expect(root.weight).toBeLessThan(0.1);
    expect(compoundRoot.weight).toBeLessThan(0.1);
  });

  it("gives secondary branches and twigs more flexible response", () => {
    const primary = classifyBranchWindBone("branch_primary_01");
    const twig = classifyBranchWindBone("branch_secondary_twig_03");
    expect(twig.weight).toBeGreaterThan(primary.weight);
    expect(twig.stiffness).toBeLessThan(primary.stiffness);
  });

  it("normalizes authored local wind axes and clamps metadata", () => {
    const config = classifyBranchWindBone("branch", {
      windWeight: 4,
      windStiffness: 0.01,
      windPhase: Number.NaN,
      windAxis: [0, 0, 4],
    });
    expect(config.weight).toBe(1);
    expect(config.stiffness).toBe(0.25);
    expect(config.axisZ).toBe(1);
    expect(Number.isFinite(config.phase)).toBe(true);
  });

  it("produces deterministic bounded motion with no wind at zero strength", () => {
    const config = classifyBranchWindBone("twig_01");
    const input = { time: 2.5, strength: 0, directionX: 1, directionZ: 0, config };
    expect(resolveBranchBoneWind(input)).toEqual(resolveBranchBoneWind(input));
    const still = resolveBranchBoneWind(input);
    expect(still.angleX).toBe(0);
    expect(still.angleY).toBe(0);
    expect(still.angleZ).toBe(0);
  });

  it("scales bend by branch weight and wind strength", () => {
    const config = classifyBranchWindBone("twig_01");
    const calm = resolveBranchBoneWind({ time: 1.2, strength: 0.2, directionX: 1, directionZ: 0, config });
    const storm = resolveBranchBoneWind({ time: 1.2, strength: 0.9, directionX: 1, directionZ: 0, config });
    expect(Math.abs(storm.angleZ)).toBeGreaterThan(Math.abs(calm.angleZ));
  });
});
