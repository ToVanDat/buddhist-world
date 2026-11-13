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
  "temple_gate",
  "main_hall",
  "buddha_statue",
  "bell",
  "incense_burner",
  "bodhi_tree",
  "lotus",
  "monk_character",
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
const inventory = expected.map((asset) => ({
  asset,
  status: glbs.some((file) => file.toLowerCase().includes(asset)) ? "GLB_PRESENT_REQUIRES_VALIDATION" : "MISSING_SOURCE_ASSET",
}));
const report = {
  generatedAt: new Date().toISOString(),
  scope: directories,
  counts: { scannedFiles: files.length, glb: glbs.length, blend: blends.length, textures: textures.length },
  productionReadiness: glbs.length > 0 ? "ASSET_PAYLOADS_FOUND_VALIDATION_REQUIRED" : "BLOCKED_NO_PRODUCTION_GLB_ASSETS",
  inventory,
  files: files.map((file) => ({ path: relative(root, file).replaceAll("\\", "/"), bytes: statSync(file).size })),
};
console.log(JSON.stringify(report, null, 2));
if (strict && glbs.length === 0) process.exitCode = 1;
