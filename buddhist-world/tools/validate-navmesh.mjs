// Validate a Blender-exported navmesh JSON file or directory.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const args = process.argv.slice(2);
const allowEmpty = args.includes("--allow-empty");
const target = args.find((value) => !value.startsWith("--"));
if (!target) {
  console.error("Missing navmesh JSON file or directory.");
  process.exit(2);
}
function collect(path) {
  if (!existsSync(path)) return [];
  const info = statSync(path);
  if (info.isFile()) return extname(path).toLowerCase() === ".json" ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? collect(child) : extname(entry.name).toLowerCase() === ".json" ? [child] : [];
  });
}
const files = collect(target);
if (!files.length) {
  const message = `No navmesh JSON files found in ${target}.`;
  if (allowEmpty) { console.warn(`SKIP: ${message} (no authored navmesh yet)`); process.exit(0); }
  console.error(message); process.exit(2);
}
let failed = 0;
for (const file of files) {
  const errors = [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (data.version !== 1) errors.push("unsupported version");
    if (typeof data.regionId !== "string" || !/^[a-z0-9_]{2,64}$/.test(data.regionId)) errors.push("invalid regionId");
    if (data.coordinateSystem !== "Y_UP_METERS") errors.push("coordinateSystem must be Y_UP_METERS");
    if (!Number.isFinite(data.maxSlopeDegrees) || data.maxSlopeDegrees <= 0 || data.maxSlopeDegrees >= 80) errors.push("invalid maxSlopeDegrees");
    if (!Array.isArray(data.vertices) || !data.vertices.length) errors.push("vertices is empty");
    if (!Array.isArray(data.polygons) || !data.polygons.length) errors.push("polygons is empty");
    const vertices = Array.isArray(data.vertices) ? data.vertices : [];
    const polygons = Array.isArray(data.polygons) ? data.polygons : [];
    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) errors.push(`vertex ${i} is not a finite 3D point`);
    }
    const ids = new Set();
    const edgeOwners = new Map();
    for (let i = 0; i < polygons.length; i++) {
      const p = polygons[i];
      if (!p || p.id !== i || ids.has(p.id)) errors.push(`polygon ${i} has invalid/non-sequential id`);
      ids.add(p?.id);
      if (!Array.isArray(p?.vertices) || p.vertices.length !== 3 || p.vertices.some((id) => !Number.isInteger(id) || id < 0 || id >= vertices.length)) {
        errors.push(`polygon ${i} must reference three valid vertices`);
        continue;
      }
      if (!Array.isArray(p.neighbors) || p.neighbors.some((id) => !Number.isInteger(id) || id < 0 || id >= polygons.length || id === i)) {
        errors.push(`polygon ${i} has invalid neighbors`);
      }
      const [a, b, c] = p.vertices.map((id) => vertices[id]);
      if ([a, b, c].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite))) {
        const ab = b.map((n, k) => n - a[k]);
        const ac = c.map((n, k) => n - a[k]);
        const cross = [ab[1]*ac[2]-ab[2]*ac[1], ab[2]*ac[0]-ab[0]*ac[2], ab[0]*ac[1]-ab[1]*ac[0]];
        const area2 = Math.hypot(...cross);
        if (area2 < 1e-6) errors.push(`polygon ${i} is degenerate`);
        else if (cross[1] / area2 < 0.01) errors.push(`polygon ${i} is not upward-facing`);
      }
      for (let e = 0; e < 3; e++) {
        const edge = [p.vertices[e], p.vertices[(e + 1) % 3]].sort((x, y) => x - y).join(":");
        const owners = edgeOwners.get(edge) ?? [];
        owners.push(i); edgeOwners.set(edge, owners);
        if (owners.length > 2) errors.push(`non-manifold edge ${edge}`);
      }
    }
    for (const p of polygons) for (const neighbor of p.neighbors ?? []) {
      if (!polygons[neighbor]?.neighbors?.includes(p.id)) errors.push(`neighbor relation ${p.id}<->${neighbor} is not reciprocal`);
    }
    for (const [edge, owners] of edgeOwners) if (owners.length === 2) {
      for (const owner of owners) if (!polygons[owner].neighbors.includes(owners.find((id) => id !== owner))) {
        errors.push(`shared edge ${edge} is missing neighbor link`);
      }
    }
    console.log(`${errors.length ? "FAIL" : "OK  "} ${file} | ${vertices.length} vertices | ${polygons.length} triangles`);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  errors.forEach((error) => console.error("  ✗", error));
  if (errors.length) failed++;
}
console.log(`Navmesh validation: ${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
