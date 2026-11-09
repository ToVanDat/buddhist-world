// Phase 0 audit - READ ONLY. Không sửa, không xoá, không gửi dữ liệu đi đâu.
// Chạy tại thư mục gốc của dự án:  node phase0-audit.mjs
// Kết quả: phase0-report.md  (hãy gửi lại file này cho Claude)
import { execSync } from "node:child_process";
import { readdirSync, statSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const out = [];
const log = (s = "") => out.push(s);
const sh = (cmd) => {
  try { return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim(); }
  catch { return "NOT FOUND / lỗi"; }
};

const IGNORE = new Set(["node_modules", ".git", "dist", "build", ".next", "__pycache__", ".venv"]);
const ASSET_EXT = new Set([".blend", ".glb", ".gltf", ".fbx", ".obj", ".ktx2", ".hdr", ".exr", ".png", ".jpg", ".jpeg", ".webp", ".mp3", ".ogg", ".wav"]);
const assets = [];
const tree = [];

function walk(dir, depth = 0) {
  let names;
  try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (IGNORE.has(n)) continue;
    const p = join(dir, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (depth < 3) tree.push("  ".repeat(depth) + n + "/");
      walk(p, depth + 1);
    } else if (ASSET_EXT.has(extname(n).toLowerCase())) {
      assets.push({ p, mb: (st.size / 1048576).toFixed(2) });
    }
  }
}

log("# PHASE 0 AUDIT REPORT");
log(`Ngày: ${new Date().toISOString()}`);
log(`OS: ${process.platform} ${process.arch}`);

log("\n## A. Công cụ đã cài");
for (const [name, cmd] of [
  ["node", "node -v"], ["npm", "npm -v"], ["pnpm", "pnpm -v"], ["git", "git --version"],
  ["python", "python --version"], ["blender", "blender --version"],
  ["docker", "docker --version"], ["psql", "psql --version"], ["redis-cli", "redis-cli --version"],
  ["gltf-transform", "gltf-transform --version"], ["toktx", "toktx --version"],
]) log(`- ${name}: ${sh(cmd).split("\n")[0]}`);

log("\n## B. Git");
log("```\n" + sh("git status -sb") + "\n```");
log("Branches:\n```\n" + sh("git branch -a") + "\n```");
log("Commit gần nhất:\n```\n" + sh("git log --oneline -n 10") + "\n```");

log("\n## C. Cấu trúc thư mục (tối đa 3 cấp)");
walk(".");
log("```\n" + tree.slice(0, 200).join("\n") + "\n```");

log("\n## D. package.json (chỉ tên + phiên bản dependencies)");
const pkgs = [];
(function find(dir, d = 0) {
  if (d > 3) return;
  let names; try { names = readdirSync(dir); } catch { return; }
  for (const n of names) {
    if (IGNORE.has(n)) continue;
    const p = join(dir, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) find(p, d + 1);
    else if (n === "package.json") pkgs.push(p);
  }
})(".");
for (const p of pkgs) {
  try {
    const j = JSON.parse(readFileSync(p, "utf8"));
    log(`\n### ${p}`);
    log("scripts: " + Object.keys(j.scripts || {}).join(", "));
    log("dependencies: " + JSON.stringify(j.dependencies || {}));
    log("devDependencies: " + JSON.stringify(j.devDependencies || {}));
  } catch { log(`- ${p}: không đọc được`); }
}

log("\n## E. Hạ tầng");
for (const f of ["docker-compose.yml", "docker-compose.yaml", "Dockerfile", "nginx.conf", ".env.example", "tsconfig.json", "vite.config.ts"]) {
  log(`- ${f}: ${existsSync(f) ? "CÓ" : "không có"}`);
}
log("(Không đọc nội dung .env để tránh lộ secret.)");
log("Docker containers đang chạy:\n```\n" + sh("docker ps --format \"{{.Names}} {{.Image}}\"") + "\n```");

log("\n## F. Blender / 3D / audio / texture (file, dung lượng MB)");
assets.sort((a, b) => b.mb - a.mb);
log(`Tổng số file: ${assets.length}`);
log("```\n" + assets.slice(0, 80).map((a) => `${a.mb} MB  ${a.p}`).join("\n") + "\n```");

log("\n## G. Phần cứng (để đánh giá hiệu năng)");
log("GPU: " + (process.platform === "win32"
  ? sh("wmic path win32_VideoController get name")
  : sh("lspci | grep -i vga")));
log("RAM/CPU: " + sh(process.platform === "win32" ? "wmic cpu get name" : "uname -a"));

writeFileSync("phase0-report.md", out.join("\n"), "utf8");
console.log("Xong. Đã tạo phase0-report.md — hãy gửi nội dung file này cho Claude.");
