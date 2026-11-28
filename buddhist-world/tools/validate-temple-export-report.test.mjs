import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateExportReport, EXPECTED_SOURCES } from "./validate-temple-export-report.mjs";

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), "bw-temple-export-"));
  const source = join(root, "source");
  const output = join(root, "output");
  mkdirSync(source, { recursive: true });
  mkdirSync(output, { recursive: true });
  try { run({ root, source, output }); } finally { rmSync(root, { recursive: true, force: true }); }
}
function createValidReport(source, output) {
  for (const file of EXPECTED_SOURCES) writeFileSync(join(source, file), "blend-source");
  const glb = join(output, "props", "bell.glb");
  mkdirSync(join(output, "props"), { recursive: true });
  writeFileSync(glb, Buffer.from([0x67, 0x6c, 0x54, 0x46]));
  const report = {
    schemaVersion: 1,
    sourceDirectory: source,
    outputDirectory: output,
    sources: EXPECTED_SOURCES.map((file) => ({ file, status: "OPENED" })),
    exports: [{
      collection: "GRENV_Bell_Pavilion_v02",
      category: "district",
      status: "EXPORTED_FOR_REVIEW",
      output: glb,
      bytes: 4,
      meshCount: 1,
    }],
  };
  writeFileSync(join(output, "temple-source-export-report.json"), JSON.stringify(report));
  return report;
}

test("valid export report verifies staged GLB and source files", () => fixture(({ source, output }) => {
  createValidReport(source, output);
  const result = validateExportReport(output);
  assert.equal(result.ok, true);
  assert.equal(result.checked, 1);
  assert.deepEqual(result.errors, []);
}));

test("missing source file blocks report validation", () => fixture(({ source, output }) => {
  const report = createValidReport(source, output);
  writeFileSync(join(source, EXPECTED_SOURCES[1]), "");
  report.sources[1].status = "MISSING";
  writeFileSync(join(output, "temple-source-export-report.json"), JSON.stringify(report));
  const result = validateExportReport(output);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes(EXPECTED_SOURCES[1])));
}));

test("missing or empty GLB blocks report validation", () => fixture(({ source, output }) => {
  const report = createValidReport(source, output);
  report.exports[0].output = join(output, "props", "missing.glb");
  writeFileSync(join(output, "temple-source-export-report.json"), JSON.stringify(report));
  const result = validateExportReport(output);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("GLB file is missing")));
}));

test("output paths cannot escape the staging directory", () => fixture(({ source, output }) => {
  const report = createValidReport(source, output);
  report.exports[0].output = join(output, "..", "outside.glb");
  writeFileSync(join(output, "temple-source-export-report.json"), JSON.stringify(report));
  const result = validateExportReport(output);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("escapes the staging directory")));
}));

test("reported file size must match actual staged GLB", () => fixture(({ source, output }) => {
  const report = createValidReport(source, output);
  report.exports[0].bytes = 99;
  writeFileSync(join(output, "temple-source-export-report.json"), JSON.stringify(report));
  const result = validateExportReport(output);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.includes("byte count mismatch")));
}));
