// Validate exported GLB files.
// Usage: pnpm validate:glb -- <file.glb|directory> [--character] [--allow-empty]
import { NodeIO } from "@gltf-transform/core";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const args = process.argv.slice(2);
const isNpc = args.includes("--npc");
const isChar = args.includes("--character") || isNpc;
const allowEmpty = args.includes("--allow-empty");
const target = args.find((arg) => !arg.startsWith("--"));
if (!target) {
  console.error("Thiếu đường dẫn GLB hoặc thư mục asset.");
  process.exit(2);
}

const MAX_MB = isChar ? 8 : 15;
const MAX_TEX = isChar ? 4096 : 2048;
const REQUIRED_MOTIONS = {
  Idle: ["idle", "stand", "standing", "breath"],
  Walk: ["walk", "walking"],
  Run: ["run", "running", "sprint"],
  Jump: ["jump", "jumping", "fall", "falling", "air"],
};
const normalize = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

function collectGlbs(path) {
  if (!existsSync(path)) return [];
  const info = statSync(path);
  if (info.isFile()) return extname(path).toLowerCase() === ".glb" ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return collectGlbs(child);
    return entry.isFile() && extname(entry.name).toLowerCase() === ".glb" ? [child] : [];
  });
}

const files = collectGlbs(target);
if (files.length === 0) {
  const message = `Không tìm thấy file .glb trong: ${target}`;
  if (allowEmpty) {
    console.warn(`SKIP: ${message} (chưa có asset để nghiệm thu)`);
    process.exit(0);
  }
  console.error(message);
  process.exit(2);
}

const io = new NodeIO();
let failed = 0;
for (const file of files) {
  const errors = [];
  const warnings = [];
  try {
    const mb = statSync(file).size / 1048576;
    if (mb > MAX_MB) warnings.push(`dung lượng ${mb.toFixed(1)} MB > ${MAX_MB} MB`);
    const document = await io.read(file);
    const root = document.getRoot();
    if (root.listScenes().length === 0) errors.push("không có scene");
    if (root.listNodes().length === 0) errors.push("không có node");
    if (root.listMeshes().length === 0) errors.push("không có mesh");

    let triangles = 0;
    for (const mesh of root.listMeshes()) {
      for (const primitive of mesh.listPrimitives()) {
        const indices = primitive.getIndices();
        const positions = primitive.getAttribute("POSITION");
        triangles += indices ? Math.floor(indices.getCount() / 3) : Math.floor((positions?.getCount() ?? 0) / 3);
        if (!positions || positions.getCount() === 0) errors.push(`mesh "${mesh.getName()}" thiếu POSITION`);
        if (!primitive.getAttribute("NORMAL")) warnings.push(`mesh "${mesh.getName()}" thiếu NORMAL`);
        const material = primitive.getMaterial();
        if (!material) errors.push(`mesh "${mesh.getName()}" không có material`);
        else if (!primitive.getAttribute("TEXCOORD_0") && material.getBaseColorTexture()) {
          errors.push(`mesh "${mesh.getName()}" có base-color texture nhưng thiếu UV`);
        }
      }
    }

    for (const texture of root.listTextures()) {
      const size = texture.getSize();
      if (size && Math.max(...size) > MAX_TEX) {
        warnings.push(`texture "${texture.getName()}" ${size.join("x")} > ${MAX_TEX}`);
      }
    }

    const animations = root.listAnimations().map((animation) => animation.getName());
    if (isChar) {
      if (root.listSkins().length === 0) errors.push("không có skin/skeleton");
      const jointNames = new Set(root.listSkins().flatMap((skin) => skin.listJoints().map((joint) => normalize(joint.getName()))));
      if (![...jointNames].some((name) => name === "root" || name.endsWith("root"))) {
        errors.push("skeleton thiếu root bone");
      }
      const normalizedAnimations = animations.map(normalize);
      const npcMotions = {
        Idle: ["idle", "stand", "standing", "breath"],
        Walk: ["walk", "walking"],
        Talk: ["talk", "talking", "gesture", "greeting"],
        Pray: ["pray", "praying", "meditation", "meditate"],
        Work: ["work", "working", "sweep", "sweeping"],
        Rest: ["rest", "sleep", "sitting", "sit"],
      };
      const requiredMotions = isNpc ? npcMotions : REQUIRED_MOTIONS;
      for (const [motion, aliases] of Object.entries(requiredMotions)) {
        if (!normalizedAnimations.some((name) => aliases.some((alias) => name.includes(alias)))) {
          errors.push(`thiếu animation ${motion} (chấp nhận alias Blender/Mixamo)`);
        }
      }
    }

    console.log(`${errors.length ? "FAIL" : "OK  "} ${file} | ${mb.toFixed(2)} MB | ${Math.round(triangles)} tris | ${root.listMaterials().length} mat | ${root.listTextures().length} tex | anim: ${animations.join(",") || "-"}`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  errors.forEach((error) => console.error("   ✗", error));
  warnings.forEach((warning) => console.warn("   !", warning));
  if (errors.length) failed += 1;
}
console.log(`GLB validation: ${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
