import test from "node:test";
import assert from "node:assert/strict";
import { inspectBranchRig } from "./branch-rig-policy.mjs";

test("accepts a weighted tree branch hierarchy", () => {
  const result = inspectBranchRig({
    joints: ["TreeRoot", "Branch_Primary_L", "Branch_Twig_L_01"],
    primitives: [{ hasJoints: true, hasWeights: true }],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("rejects rigs without a root, branch or weighted mesh", () => {
  const result = inspectBranchRig({
    joints: ["Armature", "JointA"],
    primitives: [{ hasJoints: true, hasWeights: false }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("root/trunk")));
  assert.ok(result.errors.some((error) => error.includes("branch/limb")));
  assert.ok(result.errors.some((error) => error.includes("WEIGHTS_0")));
  assert.ok(result.errors.some((error) => error.includes("three joints")));
});

test("rejects an unskinned GLB", () => {
  const result = inspectBranchRig({ joints: [], primitives: [] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("skinned mesh")));
});
