import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ASSETS = [
  {
    id: "monk_hero",
    phase: 1,
    label: "Monk Hero",
    sourceDirs: ["blender/assets/characters", "blender/projects", "blender/assets"],
    runtimeDirs: ["apps/web/public/assets/characters", "apps/web/public/assets/models"],
    aliases: ["monk", "hero", "character"],
    requiresTextures: true,
  },
  {
    id: "temple_gate",
    phase: 2,
    label: "Tam Quan",
    sourceDirs: ["blender/assets/architecture", "blender/assets/environment", "blender/projects"],
    runtimeDirs: ["apps/web/public/assets/environments", "apps/web/public/assets/models"],
    aliases: ["temple_gate", "tam_quan"],
    requiresTextures: true,
  },
  {
    id: "main_hall",
    phase: 2,
    label: "Chinh dien",
    sourceDirs: ["blender/assets/architecture", "blender/assets/environment", "blender/projects"],
    runtimeDirs: ["apps/web/public/assets/environments", "apps/web/public/assets/models"],
    aliases: ["main_hall", "chinh_dien"],
    requiresTextures: true,
  },
  {
    id: "buddha_statue",
    phase: 2,
    label: "Tuong Phat",
    sourceDirs: ["blender/assets/props", "blender/assets/architecture", "blender/projects"],
    runtimeDirs: ["apps/web/public/assets/environments", "apps/web/public/assets/models"],
    aliases: ["buddha_statue", "buddha"],
    requiresTextures: true,
  },
  {
    id: "bodhi_garden",
    phase: 2,
    label: "Vuon Bo De",
    sourceDirs: ["blender/assets/vegetation", "blender/assets/environment", "blender/projects"],
    runtimeDirs: ["apps/web/public/assets/environments", "apps/web/public/assets/models"],
    aliases: ["bodhi_garden", "bodhi_tree"],
    requiresTextures: true,
  },
];

const TEXTURE_EXT = /\.(png|jpe?g|tif{1,2}|exr|webp|ktx2)$/i;
const GLB_EXT = /\.glb$/i;
const BLEND_EXT = /\.blend$/i;

function walk(root, directory) {
  const absolute = join(root, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const path = join(absolute, entry.name);
    return entry.isDirectory() ? walk(root, relative(root, path)) : [path];
  });
}

function hasAlias(path, aliases) {
  const name = path.split(/[\\/]/).at(-1).toLowerCase();
  return aliases.some((alias) => name.includes(alias));
}

export function classifyAsset(root, spec) {
  const sourceFiles = spec.sourceDirs.flatMap((dir) => walk(root, dir))
    .filter((path) => BLEND_EXT.test(path) && hasAlias(path, spec.aliases));
  const runtimeFiles = spec.runtimeDirs.flatMap((dir) => walk(root, dir))
    .filter((path) => GLB_EXT.test(path) && hasAlias(path, spec.aliases));
  const textures = walk(root, "apps/web/public/assets/textures").filter((path) => TEXTURE_EXT.test(path));
  const reports = walk(root, "blender/reports").filter((path) =>
    path.toLowerCase().includes(spec.id) && /\.(json|png|jpe?g|webp)$/i.test(path));
  const source = sourceFiles[0] ? relative(root, sourceFiles[0]).replaceAll("\\", "/") : null;
  const runtime = runtimeFiles[0] ? relative(root, runtimeFiles[0]).replaceAll("\\", "/") : null;
  const assetTextures = textures.filter((path) => hasAlias(path, spec.aliases));
  const hasTechnicalReport = reports.some((path) => path.toLowerCase().endsWith(".json"));
  const hasVisualEvidence = reports.some((path) => /\.(png|jpe?g|webp)$/i.test(path));
  let status = "MISSING_SOURCE";
  if (source && !runtime) status = "SOURCE_ONLY";
  if (runtime && !hasTechnicalReport) status = "GLB_PRESENT_REQUIRES_VALIDATION";
  if (runtime && hasTechnicalReport && (!hasVisualEvidence || (spec.requiresTextures && assetTextures.length === 0))) {
    status = "EVIDENCE_INCOMPLETE";
  }
  if (runtime && hasTechnicalReport && hasVisualEvidence && (!spec.requiresTextures || assetTextures.length > 0)) {
    status = "READY_FOR_HUMAN_ACCEPTANCE";
  }
  return {
    id: spec.id,
    phase: spec.phase,
    label: spec.label,
    status,
    sourceBlend: source,
    runtimeGlb: runtime,
    textureFiles: assetTextures.map((path) => relative(root, path).replaceAll("\\", "/")),
    technicalReport: reports.find((path) => path.toLowerCase().endsWith(".json"))
      ? relative(root, reports.find((path) => path.toLowerCase().endsWith(".json"))).replaceAll("\\", "/")
      : null,
    visualEvidence: reports.filter((path) => /\.(png|jpe?g|webp)$/i.test(path))
      .map((path) => relative(root, path).replaceAll("\\", "/")),
    acceptance: "NOT_ACCEPTED",
    note: "Automated presence checks cannot approve silhouette, cultural accuracy, deformation, PBR appearance, or in-game quality.",
  };
}

export function buildReport(root) {
  const assets = ASSETS.map((spec) => classifyAsset(root, spec));
  const phases = [1, 2].map((phase) => {
    const rows = assets.filter((asset) => asset.phase === phase);
    const ready = rows.filter((asset) => asset.status === "READY_FOR_HUMAN_ACCEPTANCE").length;
    return {
      phase,
      status: ready === rows.length ? "READY_FOR_HUMAN_ACCEPTANCE" : "BLOCKED_BY_ASSET_OR_EVIDENCE",
      requiredAssets: rows.length,
      readyForHumanAcceptance: ready,
    };
  });
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: "Phase 1 Hero Character and Phase 2 Temple Environment",
    policy: "No asset is marked accepted automatically. Human visual, cultural, rig/deformation, and runtime review is mandatory.",
    phases,
    assets,
  };
}

function argument(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const root = process.cwd();
  const report = buildReport(root);
  const output = argument("--out", "");
  if (output) {
    const destination = resolve(root, output);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes("--strict") && report.phases.some((phase) => phase.status !== "READY_FOR_HUMAN_ACCEPTANCE")) {
    console.error("AAA phase gate failed: required source, GLB, technical report, textures, and visual evidence are incomplete.");
    process.exitCode = 1;
  }
}
