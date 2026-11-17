import { readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const directories = [
  "apps/web/public/assets/models",
  "apps/web/public/assets/textures",
  "apps/web/public/assets/environments",
  "apps/web/public/assets/characters",
  "blender",
];
const expected = [
  { asset: "temple_gate", aliases: ["temple_gate", "tam_quan", "hero_tam_quan"] },
  { asset: "main_hall", aliases: ["main_hall", "hero_main_hall"] },
  { asset: "buddha_statue", aliases: ["buddha_statue", "hero_buddha_statue"] },
  { asset: "bell", aliases: ["bell", "dai_hong_chung", "hero_dai_hong_chung"] },
  { asset: "incense_burner", aliases: ["incense_burner", "hero_incense_burner"] },
  { asset: "bodhi_tree", aliases: ["bodhi_tree", "hero_bodhi_tree"] },
  { asset: "lotus", aliases: ["lotus", "lotus_ecosystem"] },
  { asset: "monk_character", aliases: ["monk_character", "monk_npc", "npc_monk"] },
];

function walk(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const absolute = join(path, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const files = directories.flatMap((directory) => walk(join(root, directory)));
const glbs = files.filter((file) => file.toLowerCase().endsWith(".glb"));
const blends = files.filter((file) => file.toLowerCase().endsWith(".blend"));
const textures = files.filter((file) => /\.(png|jpe?g|tif{1,2}|exr|webp|ktx2)$/i.test(file));
const inventory = expected.map(({ asset, aliases }) => {
  const matches = (file) => aliases.some((alias) => file.toLowerCase().includes(alias));
  const matchingGlb = glbs.filter(matches);
  const matchingBlend = blends.filter(matches);
  return {
    asset,
    runtimeGlb: matchingGlb.length ? "PRESENT_REQUIRES_GLTF_VALIDATION" : "MISSING",
    editableBlendSource: matchingBlend.length ? "PRESENT_REQUIRES_BLENDER_REVIEW" : "MISSING_OR_NOT_ASSET_NAMED",
    glbFiles: matchingGlb.map((file) => relative(root, file).replaceAll("\\", "/")),
    blendFiles: matchingBlend.map((file) => relative(root, file).replaceAll("\\", "/")),
  };
});
const missingRuntimeAssets = inventory.filter((item) => item.runtimeGlb === "MISSING").map((item) => item.asset);
const report = {
  generatedAt: new Date().toISOString(),
  scope: directories,
  counts: { scannedFiles: files.length, glb: glbs.length, blend: blends.length, textures: textures.length },
  productionReadiness: missingRuntimeAssets.length === 0
    ? "ALL_EXPECTED_GLB_NAMES_FOUND_VALIDATION_REQUIRED"
    : "BLOCKED_EXPECTED_RUNTIME_ASSETS_MISSING",
  missingRuntimeAssets,
  inventory,
  files: files.map((file) => ({ path: relative(root, file).replaceAll("\\", "/"), bytes: statSync(file).size })),
};
console.log(JSON.stringify(report, null, 2));
if (strict && missingRuntimeAssets.length > 0) process.exitCode = 1;
