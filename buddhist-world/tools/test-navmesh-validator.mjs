import { spawnSync } from "node:child_process";
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
console.log("Navmesh validator tests: valid topology accepted; missing adjacency rejected.");
