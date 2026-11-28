import { access, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[key] = value;
  }
  return values;
}

export function isPlaceholderSecret(value = "") {
  return value.length < 32 || /CHANGE_ME|replace|example|placeholder/i.test(value);
}

function tcpProbe(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function httpProbe(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3500), redirect: "manual" });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: "unreachable" };
  }
}

function endpointParts(raw, fallbackPort) {
  try {
    const url = new URL(raw);
    return { host: url.hostname, port: Number(url.port || fallbackPort) };
  } catch {
    return { host: "127.0.0.1", port: fallbackPort };
  }
}

export async function runPreflight({ env = {}, cwd = root } = {}) {
  const checks = [];
  const add = (name, ok, detail, required = true) => checks.push({ name, ok, detail, required });

  const envFile = path.join(cwd, ".env");
  let fileExists = true;
  try { await readFile(envFile, "utf8"); } catch { fileExists = false; }
  add(".env file", fileExists, fileExists ? "Found workspace environment file" : "Copy .env.example to .env first");

  const secretReady = !isPlaceholderSecret(env.JWT_ACCESS_SECRET ?? "");
  add("JWT_ACCESS_SECRET", secretReady, secretReady ? "Configured (value hidden)" : "Set a unique random secret of at least 32 characters");

  const nodeEnv = env.NODE_ENV || "development";
  const safeMode = nodeEnv !== "production";
  add("Demo environment", safeMode, safeMode ? `NODE_ENV=${nodeEnv}` : "Production mode detected; use local or staging for the demo");

  const web = await httpProbe(env.DEMO_WEB_URL || "http://127.0.0.1:5173/");
  add("Web application", web.ok, web.ok ? "HTTP ready" : `HTTP ${web.status}; start pnpm dev:web`);

  const port = Number(env.PORT || 3001);
  const api = await httpProbe(env.DEMO_API_READY_URL || `http://127.0.0.1:${port}/api/health/ready`);
  add("API + database + Redis readiness", api.ok, api.ok ? "Health endpoint reports ready" : `HTTP ${api.status}; run pnpm db:migrate, start API and verify PostgreSQL/Redis`);

  const database = endpointParts(env.DATABASE_URL || "postgres://localhost:5433/buddhist_world", 5432);
  const postgresOk = await tcpProbe(database.host, database.port);
  add("PostgreSQL socket", postgresOk, postgresOk ? `${database.host}:${database.port} reachable` : `${database.host}:${database.port} unreachable`);

  const redis = endpointParts(env.REDIS_URL || "redis://localhost:6379", 6379);
  const redisOk = await tcpProbe(redis.host, redis.port);
  add("Redis socket", redisOk, redisOk ? `${redis.host}:${redis.port} reachable` : `${redis.host}:${redis.port} unreachable`);

  // Realtime movement can only reject wall/roof/gap clipping when the
  // authoritative region navmesh is present and valid. This preflight checks
  // file presence; the server readiness endpoint validates the DB schema,
  // while validate:navmesh performs the structural geometry validation.
  const navmeshPath = path.join(cwd, "apps", "web", "public", "assets", "navmesh", "temple_complex.json");
  let navmeshExists = true;
  try { await access(navmeshPath); } catch { navmeshExists = false; }
  add(
    "Temple navigation mesh",
    navmeshExists,
    navmeshExists ? "Navmesh file found; run pnpm validate:navmesh before demo" : "Missing temple_complex.json; movement falls back to bounds/speed checks and cannot guarantee wall or gap blocking",
  );

  // Report real Blender sources, runtime GLBs, texture payloads and visual
  // evidence separately from service health. This is advisory because the
  // procedural blockout can still boot, but it is not a production-quality
  // asset acceptance result.
  try {
    const aaa = buildAaaReadinessReport(cwd);
    const ready = aaa.assets.filter((asset) => asset.status === "READY_FOR_HUMAN_ACCEPTANCE").length;
    add(
      "AAA asset evidence (advisory)",
      ready === aaa.assets.length && aaa.assets.length > 0,
      `${ready}/${aaa.assets.length} hero/temple assets have source, GLB, technical report, textures and visual evidence; human acceptance is still required`,
      false,
    );
  } catch {
    add("AAA asset evidence (advisory)", false, "Could not inspect asset evidence; run pnpm audit:aaa-phases", false);
  }

  const livekitConfigured = Boolean(env.LIVEKIT_PUBLIC_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
  if (livekitConfigured) {
    const livekit = endpointParts(env.LIVEKIT_PUBLIC_URL, 7880);
    const livekitOk = await tcpProbe(livekit.host, livekit.port);
    add("LiveKit (optional)", livekitOk, livekitOk ? "Configured endpoint reachable; still verify with two clients" : "Configured endpoint is not reachable", false);
  } else {
    add("LiveKit (optional)", true, "Not configured; omit voice from the live demo", false);
  }

  const audioConfigured = Boolean(env.VITE_PRAYER_AUDIO_URL);
  add("Prayer audio (optional)", true, audioConfigured ? "URL configured; test playback and rights before demo" : "No recording configured; demonstrate the manual counter only", false);

  const required = checks.filter((check) => check.required);
  return { ok: required.every((check) => check.ok), checks };
}

async function main() {
  let env = {};
  try {
    env = parseEnv(await readFile(path.join(root, ".env"), "utf8"));
  } catch {
    // runPreflight emits the actionable missing-file result.
  }
  const result = await runPreflight({ env, cwd: root });
  console.log("\nBUDDHIST WORLD — DEMO PREFLIGHT");
  for (const check of result.checks) {
    const state = check.ok ? (check.required ? "PASS" : "INFO") : (check.required ? "FAIL" : "WARN");
    console.log(`[${state}] ${check.name}: ${check.detail}`);
  }
  console.log(result.ok ? "\nPreflight passed. This checks service reachability, not visual/asset acceptance." : "\nPreflight failed. Fix required checks before presenting the demo.");
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
