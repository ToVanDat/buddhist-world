import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const EXPECTED_SOURCES = [
  "ENV_Temple_Ancillary_v02.blend",
  "ENV_Temple_Details_v01.blend",
  "ENV_Temple_Groundcover_v01.blend",
];
const VALID_CATEGORIES = new Set(["district", "core-review", "props", "groundcover"]);

function inside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function validateExportReport(exportDirectory) {
  const root = resolve(exportDirectory);
  const reportPath = join(root, "temple-source-export-report.json");
  const errors = [];
  const warnings = [];
  if (!existsSync(reportPath)) {
    return { ok: false, reportPath, checked: 0, errors: ["Missing temple-source-export-report.json"], warnings };
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    return { ok: false, reportPath, checked: 0, errors: [`Invalid export report JSON: ${error.message}`], warnings };
  }

  if (report.schemaVersion !== 1) errors.push("Unsupported or missing schemaVersion (expected 1).");
  if (resolve(report.outputDirectory || "") !== root) {
    errors.push("Report outputDirectory does not match the directory being validated.");
  }

  const sources = Array.isArray(report.sources) ? report.sources : [];
  for (const expected of EXPECTED_SOURCES) {
    const source = sources.find((item) => item?.file === expected);
    if (!source || source.status !== "OPENED") {
      errors.push(`Source file was not opened successfully: ${expected}`);
      continue;
    }
    const sourcePath = resolve(report.sourceDirectory || "", expected);
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      errors.push(`Source file is not present at reported sourceDirectory: ${expected}`);
    }
  }

  const exports = Array.isArray(report.exports) ? report.exports : [];
  if (exports.length === 0) errors.push("Report contains no exported collections.");
  if (exports.length > 18) errors.push(`Unexpected export count: ${exports.length} (maximum 18).`);

  const seenCollections = new Set();
  const seenOutputs = new Set();
  let checked = 0;
  for (const item of exports) {
    const name = item?.collection;
    if (!name || seenCollections.has(name)) {
      errors.push(`Missing or duplicate collection entry: ${name || "(unnamed)"}`);
      continue;
    }
    seenCollections.add(name);
    if (!VALID_CATEGORIES.has(item.category)) errors.push(`Invalid category for ${name}: ${item.category}`);
    if (item.status !== "EXPORTED_FOR_REVIEW") {
      errors.push(`${name} did not export successfully (status: ${item.status || "missing"}).`);
      continue;
    }
    if (!item.output || typeof item.output !== "string") {
      errors.push(`${name} has no output path.`);
      continue;
    }
    const outputPath = resolve(root, item.output);
    if (!inside(root, outputPath)) {
      errors.push(`${name} output escapes the staging directory: ${item.output}`);
      continue;
    }
    const relativeOutput = relative(root, outputPath).toLowerCase();
    if (seenOutputs.has(relativeOutput)) errors.push(`Duplicate output path: ${item.output}`);
    seenOutputs.add(relativeOutput);
    if (!outputPath.toLowerCase().endsWith(".glb")) errors.push(`${name} output is not a .glb file.`);
    if (!existsSync(outputPath) || !statSync(outputPath).isFile()) {
      errors.push(`${name} GLB file is missing: ${item.output}`);
      continue;
    }
    const actualBytes = statSync(outputPath).size;
    if (actualBytes <= 0) errors.push(`${name} GLB is empty.`);
    if (Number.isFinite(item.bytes) && item.bytes !== actualBytes) {
      errors.push(`${name} byte count mismatch: report=${item.bytes}, actual=${actualBytes}.`);
    }
    if (!Number.isInteger(item.meshCount) || item.meshCount < 1) {
      errors.push(`${name} has no reported mesh objects.`);
    }
    checked += 1;
  }

  return { ok: errors.length === 0, reportPath, checked, errors, warnings };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node tools/validate-temple-export-report.mjs <export-directory>");
    process.exit(2);
  }
  const result = validateExportReport(target);
  for (const warning of result.warnings) console.warn("WARN:", warning);
  for (const error of result.errors) console.error("FAIL:", error);
  if (result.ok) console.log(`OK: export report validated; ${result.checked} GLB file(s) verified.`);
  else process.exitCode = 1;
}
