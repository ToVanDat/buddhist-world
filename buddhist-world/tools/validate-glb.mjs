// Kiểm tra GLB đã export. Dùng:  node tools/validate-glb.mjs <file.glb|thư mục> [--character]
// Yêu cầu: pnpm install (đã có @gltf-transform/core). Thoát mã 1 nếu có lỗi.
import { NodeIO } from "@gltf-transform/core";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const isChar = args.includes("--character");
const target = args.find((a) => !a.startsWith("--"));
if (!target) { console.error("Thiếu đường dẫn."); process.exit(2); }

const MAX_MB = isChar ? 8 : 15;
const MAX_TEX = 2048;
const REQUIRED_ANIMS = ["Idle", "Walk", "Run", "Jump"];
const files = statSync(target).isDirectory()
  ? readdirSync(target).filter((f) => f.endsWith(".glb")).map((f) => join(target, f)) : [target];

const io = new NodeIO();
let failed = 0;
for (const f of files) {
  const errs = [], warns = [];
  const mb = statSync(f).size / 1048576;
  if (mb > MAX_MB) warns.push(`dung lượng ${mb.toFixed(1)} MB > ${MAX_MB} MB`);
  const doc = await io.read(f);
  const root = doc.getRoot();
  let tris = 0;
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
    const idx = p.getIndices(); const pos = p.getAttribute("POSITION");
    tris += idx ? idx.getCount() / 3 : (pos?.getCount() ?? 0) / 3;
    if (!p.getAttribute("NORMAL")) warns.push(`mesh "${m.getName()}" thiếu NORMAL`);
    if (!p.getMaterial()) errs.push(`mesh "${m.getName()}" không có material`);
    else if (!p.getAttribute("TEXCOORD_0") && p.getMaterial().getBaseColorTexture()) errs.push(`mesh "${m.getName()}" có texture nhưng thiếu UV`);
  }
  for (const t of root.listTextures()) {
    const s = t.getSize();
    if (s && Math.max(...s) > MAX_TEX) warns.push(`texture "${t.getName()}" ${s.join("x")} > ${MAX_TEX}`);
  }
  const anims = root.listAnimations().map((a) => a.getName());
  if (isChar) {
    for (const r of REQUIRED_ANIMS) if (!anims.includes(r)) errs.push(`thiếu animation "${r}"`);
    if (root.listSkins().length === 0) errs.push("không có skin/skeleton");
  }
  console.log(`${errs.length ? "FAIL" : "OK  "} ${f} | ${mb.toFixed(2)} MB | ${Math.round(tris)} tris | ${root.listMaterials().length} mat | ${root.listTextures().length} tex | anim: ${anims.join(",") || "-"}`);
  errs.forEach((e) => console.log("   ✗", e)); warns.forEach((w) => console.log("   !", w));
  if (errs.length) failed++;
}
process.exit(failed ? 1 : 0);
