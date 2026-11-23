import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReport, classifyAsset } from "./aaa-phase-readiness.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "bw-aaa-gate-"));
  try { run(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function put(root, path, content = "fixture") {
  const file = join(root, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
}

test("missing monk source remains blocked", () => fixture((root) => {
  const result = classifyAsset(root, {
    id: "monk_hero", phase: 1, label: "Monk Hero",
    sourceDirs: ["blender/assets/characters"], runtimeDirs: ["apps/web/public/assets/characters"],
    aliases: ["monk"], requiresTextures: true,
  });
  assert.equal(result.status, "MISSING_SOURCE");
  assert.equal(result.acceptance, "NOT_ACCEPTED");
}));

test("a Blender source without runtime GLB is source-only", () => fixture((root) => {
  put(root, "blender/assets/characters/monk_character.blend");
  const result = classifyAsset(root, {
    id: "monk_hero", phase: 1, label: "Monk Hero",
    sourceDirs: ["blender/assets/characters"], runtimeDirs: ["apps/web/public/assets/characters"],
    aliases: ["monk"], requiresTextures: true,
  });
  assert.equal(result.status, "SOURCE_ONLY");
}));

test("a GLB without technical report cannot pass", () => fixture((root) => {
  put(root, "blender/assets/characters/monk_character.blend");
  put(root, "apps/web/public/assets/characters/monk_character.glb");
  const result = classifyAsset(root, {
    id: "monk_hero", phase: 1, label: "Monk Hero",
    sourceDirs: ["blender/assets/characters"], runtimeDirs: ["apps/web/public/assets/characters"],
    aliases: ["monk"], requiresTextures: true,
  });
  assert.equal(result.status, "GLB_PRESENT_REQUIRES_VALIDATION");
  assert.equal(result.acceptance, "NOT_ACCEPTED");
}));

test("technical report, matching texture and visual evidence only reach human review", () => fixture((root) => {
  put(root, "blender/assets/characters/monk_character.blend");
  put(root, "apps/web/public/assets/characters/monk_character.glb");
  put(root, "apps/web/public/assets/textures/monk_hero_basecolor.png");
  put(root, "blender/reports/monk_hero_quality.json", JSON.stringify({ status: "TECHNICALLY_READY", issues: [] }));
  put(root, "blender/reports/monk_hero_front.png");
  const result = classifyAsset(root, {
    id: "monk_hero", phase: 1, label: "Monk Hero",
    sourceDirs: ["blender/assets/characters"], runtimeDirs: ["apps/web/public/assets/characters"],
    aliases: ["monk"], requiresTextures: true,
  });
  assert.equal(result.status, "READY_FOR_HUMAN_ACCEPTANCE");
  assert.equal(result.acceptance, "NOT_ACCEPTED");
}));

test("phase report never treats documentation or procedural files as accepted assets", () => fixture((root) => {
  put(root, "blender/scripts/generate_temple_complex.py");
  const report = buildReport(root);
  assert.equal(report.phases[0].status, "BLOCKED_BY_ASSET_OR_EVIDENCE");
  assert.equal(report.phases[1].status, "BLOCKED_BY_ASSET_OR_EVIDENCE");
  assert.ok(report.assets.every((asset) => asset.acceptance === "NOT_ACCEPTED"));
}));

test("a failed technical report cannot pass", () => fixture((root) => {
  put(root, "blender/assets/characters/monk_character.blend");
  put(root, "apps/web/public/assets/characters/monk_character.glb");
  put(root, "apps/web/public/assets/textures/monk_hero_basecolor.png");
  put(root, "blender/reports/monk_hero_quality.json", JSON.stringify({ status: "REVIEW_REQUIRED", issues: ["missing_uv"] }));
  put(root, "blender/reports/monk_hero_front.png");
  const result = classifyAsset(root, {
    id: "monk_hero", phase: 1, label: "Monk Hero",
    sourceDirs: ["blender/assets/characters"], runtimeDirs: ["apps/web/public/assets/characters"],
    aliases: ["monk"], requiresTextures: true,
  });
  assert.equal(result.status, "GLB_PRESENT_REQUIRES_VALIDATION");
}));
