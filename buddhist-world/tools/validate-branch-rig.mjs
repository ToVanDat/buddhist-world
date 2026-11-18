// Validate GLB skeletons for the branch-bone wind contract.
// Usage: pnpm validate:branch-rig -- <file.glb|directory> [--allow-empty]
import { NodeIO } from "@gltf-transform/core";
import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { inspectBranchRig } from "./branch-rig-policy.mjs";

const target = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const allowEmpty = process.argv.includes("--allow-empty");
if (!target) {
  console.error("Missing GLB file or directory.");
  process.exit(2);
}
function collect(path) {
  if (!existsSync(path)) return [];
  const info = statSync(path);
  if (info.isFile()) return extname(path).toLowerCase() === ".glb" ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? collect(child) : entry.isFile() && extname(entry.name).toLowerCase() === ".glb" ? [child] : [];
  });
}
const files = collect(target);
if (!files.length) {
  if (allowEmpty) {
    console.warn(`SKIP: no GLB files in ${target}; branch rig asset acceptance is pending.`);
    process.exit(0);
  }
  console.error(`No GLB files in ${target}`);
  process.exit(2);
}
const io = new NodeIO();
let failures = 0;
for (const file of files) {
  try {
    const root = (await io.read(file)).getRoot();
    const skins = root.listSkins();
    if (!skins.length) {
      console.log(`SKIP ${file}: no skinned rigs`);
      continue;
    }
    const joints = [...new Set(skins.flatMap((skin) => skin.listJoints().map((joint) => joint.getName())))];
    const primitives = root.listMeshes().flatMap((mesh) => mesh.listPrimitives())
      .filter((primitive) => primitive.getAttribute("JOINTS_0") || primitive.getAttribute("WEIGHTS_0"))
      .map((primitive) => ({
        hasJoints: Boolean(primitive.getAttribute("JOINTS_0")),
        hasWeights: Boolean(primitive.getAttribute("WEIGHTS_0")),
      }));
    const result = inspectBranchRig({ joints, primitives });
    if (!result.valid) {
      failures += 1;
      console.error(`FAIL ${file}`);
      result.errors.forEach((error) => console.error("  -", error));
    } else {
      console.log(`PASS ${file} | ${joints.length} joints | ${primitives.length} skinned primitives`);
    }
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
console.log(`Branch rig validation: ${files.length - failures}/${files.length} passed`);
process.exit(failures ? 1 : 0);
