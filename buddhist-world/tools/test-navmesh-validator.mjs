import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const validator = resolve(root, "validate-navmesh.mjs");
const valid = spawnSync(process.execPath, [validator, resolve(root, "fixtures/navmesh-valid.json")], { encoding: "utf8" });
if (valid.status !== 0) {
  process.stderr.write(valid.stdout + valid.stderr);
  throw new Error("Valid navmesh fixture was rejected.");
}
const invalid = spawnSync(process.execPath, [validator, resolve(root, "fixtures/navmesh-invalid.json")], { encoding: "utf8" });
if (invalid.status === 0) {
  process.stderr.write(invalid.stdout + invalid.stderr);
  throw new Error("Invalid navmesh fixture was accepted.");
}
const validDocument = JSON.parse(readFileSync(resolve(root, "fixtures/navmesh-valid.json"), "utf8"));
const steepDocument = {
  ...validDocument,
  maxSlopeDegrees: 20,
  vertices: [[0,0,0],[0,1,1],[1,0,0]],
  polygons: [{ id: 0, vertices: [0,1,2], neighbors: [] }],
};
const tempDir = mkdtempSync(resolve(tmpdir(), "bw-navmesh-test-"));
try {
  const steepPath = resolve(tempDir, "steep.json");
  writeFileSync(steepPath, JSON.stringify(steepDocument));
  const steep = spawnSync(process.execPath, [validator, steepPath], { encoding: "utf8" });
  if (steep.status === 0 || !/exceeds maxSlopeDegrees/.test(steep.stderr)) {
    process.stderr.write(steep.stdout + steep.stderr);
    throw new Error("Over-steep navmesh surface was accepted.");
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
console.log("Navmesh validator tests: valid topology accepted; missing adjacency and over-steep surfaces rejected.");
