const ROOT_PATTERN = /(root|trunk|stem|base)/i;
const BRANCH_PATTERN = /(branch|limb|bough|twig|sprig)/i;

export function inspectBranchRig({ joints = [], primitives = [] }) {
  const errors = [];
  const normalized = joints.map((joint) => String(joint).toLowerCase());
  if (!normalized.some((name) => name === "root" || ROOT_PATTERN.test(name))) {
    errors.push("skeleton has no root/trunk joint");
  }
  if (!normalized.some((name) => BRANCH_PATTERN.test(name))) {
    errors.push("skeleton has no branch/limb/twig joint");
  }
  if (joints.length < 3) errors.push("branch rig requires at least three joints (root, branch, flexible tip)");
  if (primitives.length === 0) errors.push("GLB has no skinned mesh primitives");
  for (const [index, primitive] of primitives.entries()) {
    if (!primitive.hasJoints) errors.push(`skinned primitive ${index} is missing JOINTS_0`);
    if (!primitive.hasWeights) errors.push(`skinned primitive ${index} is missing WEIGHTS_0`);
  }
  return { valid: errors.length === 0, errors };
}
