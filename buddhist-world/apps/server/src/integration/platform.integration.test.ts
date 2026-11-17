import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io as createSocket, type Socket as ClientSocket } from "socket.io-client";

const databaseUrl = process.env.BW_TEST_DATABASE_URL;
const redisUrl = process.env.BW_TEST_REDIS_URL;
const enabled = Boolean(databaseUrl && redisUrl);
const schema = `bw_it_${randomUUID().replace(/-/g, "")}`;

let admin: Client | undefined;
let server: Server | undefined;
let baseUrl = "";
let secondBaseUrl = "";
let pool: typeof import("../db/pool.js").pool;
let redis: typeof import("../lib/redis.js").redis;
let gateway: { close: (callback?: (error?: Error) => void) => void } | undefined;
let gatewayWorker: ChildProcess | undefined;
const clients: ClientSocket[] = [];

function cookieOf(response: Response) {
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Expected bw_refresh cookie from auth endpoint");
  return cookie.split(";")[0]!;
}

const testIp = Array.from({ length: 4 }, (_, index) =>
  1 + (Number.parseInt(schema.slice(6 + index * 2, 8 + index * 2), 16) % 254),
).join(".");

async function requestAt(url: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", testIp);
  return fetch(`${url}${path}`, { ...init, headers });
}

async function waitForRedisReady(
  client: typeof import("../lib/redis.js").redis,
  timeoutMs = 10_000,
): Promise<void> {
  if (client.status === "ready") return;
  // A manually disconnected ioredis client is in "end"/"wait". If it is
  // already connecting or reconnecting, wait for that attempt instead of
  // calling connect() a second time.
  if (client.status === "end" || client.status === "wait") {
    await client.connect();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      client.removeListener("ready", onReady);
      client.removeListener("end", onEnd);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onEnd = () => { cleanup(); reject(new Error("Redis connection ended before becoming ready.")); };
    timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Redis did not become ready within ${timeoutMs}ms.`));
    }, timeoutMs);
    client.once("ready", onReady);
    client.once("end", onEnd);
  });
}

async function request(path: string, init: RequestInit = {}) {
  return requestAt(baseUrl, path, init);
}

async function register(suffix: string) {
  // Give each test account a unique synthetic source IP so the auth route's
  // per-IP registration limiter remains part of the test rather than capping
  // the number of independent load-test users.
  const ipSeed = randomUUID().replace(/-/g, "");
  const sourceIp = Array.from({ length: 4 }, (_, index) =>
    1 + (Number.parseInt(ipSeed.slice(index * 2, index * 2 + 2), 16) % 254),
  ).join(".");
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": sourceIp },
    body: JSON.stringify({
      email: `player-${suffix}@integration.test`,
      username: `player_${suffix.replace(/-/g, "").slice(0, 12)}`,
      password: "Integration-password-2026!",
    }),
  });
  expect(response.status).toBe(201);
  return { body: await response.json() as { accessToken: string; user: { id: string } }, cookie: cookieOf(response) };
}

async function setPresence(
  userId: string,
  position: [number, number, number],
  regionId = "temple_complex",
) {
  const ownerKey = `socket-owner:${userId}`;
  let ownerToken = await redis.get(ownerKey);
  if (!ownerToken) {
    ownerToken = randomUUID();
    await redis.set(ownerKey, ownerToken, "PX", 60_000);
  }
  const epochKey = `socket-owner-epoch:${userId}`;
  if (!(await redis.get(epochKey))) await redis.set(epochKey, "1", "NX");
  await redis.hset(
    `presence:${userId}`,
    "region", regionId,
    "x", String(position[0]),
    "y", String(position[1]),
    "z", String(position[2]),
    "heartbeatAt", String(Date.now()),
    "ownerToken", ownerToken,
    "ownerEpoch", String(await redis.get(epochKey)),
    "seq", "12",
  );
  const epoch = Number(await redis.get(epochKey));
  await pool.query(
    `INSERT INTO socket_owner_authority (user_id, owner_token, owner_epoch, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id) DO UPDATE SET owner_token = EXCLUDED.owner_token,
       owner_epoch = GREATEST(socket_owner_authority.owner_epoch, EXCLUDED.owner_epoch), updated_at = now()`,
    [userId, ownerToken, epoch]);
  const { getRegion } = await import("@bw/shared");
  const spawnId = getRegion(regionId)?.defaultSpawn ?? "main_entrance";
  await pool.query(
    `INSERT INTO player_locations
       (user_id, region_id, spawn_id, x, y, z, yaw, updated_at, state_updated_at, owner_epoch)
     VALUES ($1,$2,$3,$4,$5,$6,0,now(),now(),$7)
     ON CONFLICT (user_id) DO UPDATE SET
       owner_epoch=GREATEST(player_locations.owner_epoch, EXCLUDED.owner_epoch)`,
    [userId, regionId, spawnId, position[0], position[1], position[2], epoch],
  );
}

describe.skipIf(!enabled)("PostgreSQL + Redis platform integration", () => {
  beforeAll(async () => {
    const parsedDb = new URL(databaseUrl!);
    if (!/(?:^|[_-])test(?:$|[_-])/i.test(decodeURIComponent(parsedDb.pathname.slice(1)))) {
      throw new Error("BW_TEST_DATABASE_URL must point to a database whose name contains 'test'.");
    }
    const parsedRedis = new URL(redisUrl!);
    if (parsedRedis.pathname !== "/15") {
      throw new Error("BW_TEST_REDIS_URL must use isolated Redis database /15.");
    }

    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await admin.query(`CREATE SCHEMA "${schema}"`);

    const scopedDb = new URL(databaseUrl!);
    scopedDb.searchParams.set("options", `-c search_path=${schema},public`);
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = scopedDb.toString();
    process.env.REDIS_URL = redisUrl!;
    process.env.CORS_ORIGIN = "http://localhost:5173";
    process.env.JWT_ACCESS_SECRET = "integration-test-secret-never-use-in-production-2026";
    process.env.ACCESS_TOKEN_TTL_SEC = "900";
    process.env.REFRESH_TOKEN_TTL_SEC = "3600";
    process.env.REFRESH_ROTATION_GRACE_MS = "1000";
    process.env.COOKIE_SECURE = "false";
    process.env.SOCKET_OWNER_LEASE_MS = "3000";

    const db = await import("../db/pool.js");
    pool = db.pool;
    const migrationDir = new URL("../db/migrations/", import.meta.url);
    for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
      await pool.query(readFileSync(new URL(file, migrationDir), "utf8"));
    }

    const redisModule = await import("../lib/redis.js");
    redis = redisModule.redis;
    await waitForRedisReady(redis);
    await redis.ping();

    const { createApp } = await import("../app.js");
    const { attachGateway } = await import("../realtime/gateway.js");
    server = createServer(createApp());
    gateway = await attachGateway(server);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind integration HTTP server");
    baseUrl = `http://127.0.0.1:${address.port}`;

  }, 30_000);

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    // Let Socket.IO deliver disconnect events before closing Redis-backed adapters.
    await new Promise((resolve) => setTimeout(resolve, 200));
    if (gateway) await new Promise<void>((resolve) => gateway!.close(() => resolve()));
    else if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (gatewayWorker && gatewayWorker.exitCode === null && gatewayWorker.signalCode === null) {
      gatewayWorker.kill("SIGTERM");
      await new Promise<void>((resolve) => gatewayWorker!.once("exit", () => resolve()));
    }
    if (pool) await pool.end();
    if (redis) await redis.quit();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  }, 30_000);

  it("registers a player, reads their profile and persists display name + checkpoint", async () => {
    const created = await register(randomUUID());
    const profile = await request("/api/me", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect(profile.status).toBe(200);
    const profileBody = await profile.json() as { display_name: string; region_id: string; spawn_id: string; yaw: number };
    expect(profileBody.display_name).toBeTruthy();

    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: created.body.user.id ? (await pool.query("SELECT email FROM users WHERE id = $1", [created.body.user.id])).rows[0].email : "",
        password: "Integration-password-2026!",
      }),
    });
    expect(login.status).toBe(200);
    const loginBody = await login.json() as { accessToken: string };
    expect(loginBody.accessToken).toBeTruthy();
    const oldSession = await request("/api/me", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect(oldSession.status).toBe(401);
    const activeSessions = await pool.query(
      "SELECT id FROM player_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [created.body.user.id],
    );
    expect(activeSessions.rows).toHaveLength(1);

    const updated = await request("/api/me/profile", {
      method: "PUT",
      headers: { authorization: `Bearer ${loginBody.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Tô Văn Đạt Integration" }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ displayName: "Tô Văn Đạt Integration" });
    const refreshedProfile = await request("/api/me", {
      headers: { authorization: `Bearer ${loginBody.accessToken}` },
    });
    expect((await refreshedProfile.json() as { display_name: string }).display_name).toBe("Tô Văn Đạt Integration");

    await setPresence(created.body.user.id, [-18, 1.2, 4]);
    const checkpoint = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${loginBody.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(checkpoint.status).toBe(204);
    const duplicateCheckpoint = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${loginBody.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(duplicateCheckpoint.status).toBe(409);

    const saved = await pool.query(
      "SELECT region_id, spawn_id, x, y, z, yaw FROM player_locations WHERE user_id = $1",
      [created.body.user.id],
    );
    expect(saved.rows[0]).toMatchObject({ region_id: "temple_complex", spawn_id: "lotus_pond" });
    expect(saved.rows[0].yaw).toBeCloseTo(Math.PI / 2, 5);
    expect([saved.rows[0].x, saved.rows[0].y, saved.rows[0].z].every(Number.isFinite)).toBe(true);
  });

  it("serializes concurrent logins so only the last game session remains active", async () => {
    const created = await register(randomUUID());
    const email = (await pool.query("SELECT email FROM users WHERE id = $1", [created.body.user.id])).rows[0].email;
    const login = () => request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Integration-password-2026!" }),
    });
    const [first, second] = await Promise.all([login(), login()]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const firstBody = await first.json() as { accessToken: string };
    const secondBody = await second.json() as { accessToken: string };

    const active = await pool.query(
      "SELECT id FROM player_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [created.body.user.id],
    );
    expect(active.rows).toHaveLength(1);

    const [firstCheck, secondCheck] = await Promise.all([
      request("/api/me", { headers: { authorization: `Bearer ${firstBody.accessToken}` } }),
      request("/api/me", { headers: { authorization: `Bearer ${secondBody.accessToken}` } }),
    ]);
    expect([firstCheck.status, secondCheck.status].sort()).toEqual([200, 401]);
  });

  it("replaying a refresh token from a replaced login does not revoke the new login session", async () => {
    const created = await register(randomUUID());
    const email = (await pool.query("SELECT email FROM users WHERE id = $1", [created.body.user.id])).rows[0].email;
    const login = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: "Integration-password-2026!" }),
    });
    expect(login.status).toBe(200);
    const loginBody = await login.json() as { accessToken: string };

    await new Promise((resolve) => setTimeout(resolve, Number(process.env.REFRESH_ROTATION_GRACE_MS) + 50));
    const replay = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(replay.status).toBe(401);
    const active = await pool.query(
      "SELECT id FROM player_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [created.body.user.id],
    );
    expect(active.rows).toHaveLength(1);
    const newSession = await request("/api/me", {
      headers: { authorization: `Bearer ${loginBody.accessToken}` },
    });
    expect(newSession.status).toBe(200);
  });

  it("rotates refresh tokens in-place and revokes the session when an old token is reused", async () => {
    const created = await register(randomUUID());
    const rotated = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(rotated.status).toBe(200);
    const rotatedBody = await rotated.json() as { accessToken: string };
    const { verifyAccess } = await import("../lib/tokens.js");
    const beforeClaims = verifyAccess(created.body.accessToken);
    const afterClaims = verifyAccess(rotatedBody.accessToken);
    expect(afterClaims?.sessionId).toBe(beforeClaims?.sessionId);
    const rotatedRows = await pool.query(
      "SELECT id, revoked_at FROM player_sessions WHERE user_id = $1",
      [created.body.user.id],
    );
    expect(rotatedRows.rows).toHaveLength(1);
    expect(rotatedRows.rows[0].revoked_at).toBeNull();

    await new Promise((resolve) => setTimeout(resolve, Number(process.env.REFRESH_ROTATION_GRACE_MS) + 50));
    const replay = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(replay.status).toBe(401);

    // Replaying a rotated token revokes its stable session row, not a session family.
    const sessions = await pool.query(
      "SELECT revoked_at FROM player_sessions WHERE user_id = $1",
      [created.body.user.id],
    );
    expect(sessions.rows.length).toBe(1);
    expect(sessions.rows.every((row) => row.revoked_at !== null)).toBe(true);

    const protectedRequest = await request("/api/me", {
      headers: { authorization: `Bearer ${rotatedBody.accessToken}` },
    });
    expect(protectedRequest.status).toBe(401);
  });

  it("fails closed when Redis is unavailable before refresh and stays DB-consistent if Redis drops after admission", async () => {
    const { env: runtimeEnv } = await import("../config/env.js");
    const previousMode = runtimeEnv.NODE_ENV;
    const originalEval = redis.eval;
    const blocked = await register(randomUUID());
    const admitted = await register(randomUUID());
    const before = await pool.query<{ token_hash: string; revoked_at: Date | null }>(
      "SELECT token_hash, revoked_at FROM player_sessions WHERE user_id = $1",
      [blocked.body.user.id],
    );
    const admittedBefore = await pool.query<{ token_hash: string }>(
      "SELECT token_hash FROM player_sessions WHERE user_id = $1",
      [admitted.body.user.id],
    );
    runtimeEnv.NODE_ENV = "production";

    try {
      // Simulate ECONNRESET at the Redis rate-limit boundary.
      redis.eval = (() => Promise.reject(Object.assign(new Error("simulated Redis ECONNRESET"), { code: "ECONNRESET" }))) as typeof redis.eval;
      const unavailable = await request("/api/auth/refresh", {
        method: "POST",
        headers: { cookie: blocked.cookie, origin: "http://localhost:5173" },
      });
      expect(unavailable.status).toBe(503);
      const unchanged = await pool.query<{ token_hash: string; revoked_at: Date | null }>(
        "SELECT token_hash, revoked_at FROM player_sessions WHERE user_id = $1",
        [blocked.body.user.id],
      );
      expect(unchanged.rows[0]?.token_hash).toBe(before.rows[0]?.token_hash);
      expect(unchanged.rows[0]?.revoked_at).toBeNull();

      let firstRedisCall = true;
      // The rate-limit check succeeds, then the Redis client starts failing.
      // Refresh rotation itself is PostgreSQL-authoritative and must still commit.
      redis.eval = (() => {
        if (firstRedisCall) {
          firstRedisCall = false;
          return Promise.resolve(1) as ReturnType<typeof redis.eval>;
        }
        return Promise.reject(Object.assign(new Error("simulated Redis disconnect after admission"), { code: "ECONNRESET" }));
      }) as typeof redis.eval;
      const refreshed = await request("/api/auth/refresh", {
        method: "POST",
        headers: { cookie: admitted.cookie, origin: "http://localhost:5173" },
      });
      expect(refreshed.status).toBe(200);
      const committed = await pool.query<{ token_hash: string; revoked_at: Date | null }>(
        "SELECT token_hash, revoked_at FROM player_sessions WHERE user_id = $1",
        [admitted.body.user.id],
      );
      expect(committed.rows[0]?.token_hash).not.toBe(admittedBefore.rows[0]?.token_hash);
      expect(committed.rows[0]?.revoked_at).toBeNull();
    } finally {
      redis.eval = originalEval;
      runtimeEnv.NODE_ENV = previousMode;
    }
  });

  it("keeps readiness degraded while PostgreSQL or Redis is unavailable and recovers when both return", async () => {
    const originalPing = redis.ping;
    const originalQuery = pool.query;

    try {
      redis.ping = (() => Promise.reject(Object.assign(new Error("simulated Redis restart"), { code: "ECONNRESET" }))) as typeof redis.ping;
      const redisUnavailable = await request("/api/health/ready");
      expect(redisUnavailable.status).toBe(503);
      expect(await redisUnavailable.json()).toEqual({
        status: "degraded",
        checks: { postgres: true, redis: false },
      });

      redis.ping = originalPing;
      pool.query = (() => Promise.reject(Object.assign(new Error("simulated PostgreSQL restart"), { code: "ECONNRESET" }))) as typeof pool.query;
      const postgresUnavailable = await request("/api/health/ready");
      expect(postgresUnavailable.status).toBe(503);
      expect(await postgresUnavailable.json()).toEqual({
        status: "degraded",
        checks: { postgres: false, redis: true },
      });
    } finally {
      redis.ping = originalPing;
      pool.query = originalQuery;
    }

    const recovered = await request("/api/health/ready");
    expect(recovered.status).toBe(200);
    expect(await recovered.json()).toEqual({
      status: "ready",
      checks: { postgres: true, redis: true },
    });
  });

  it("recovers PostgreSQL pooled connections and Redis after independent connection interruptions", async () => {
    const { default: pg } = await import("pg");
    const recoveryPool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 2_000,
    });
    const recoveryPoolErrors: Error[] = [];
    // pg.Pool emits "error" for an idle client terminated by PostgreSQL.
    // The interruption is intentional here, so observe it instead of allowing
    // Node's unhandled EventEmitter error path to fail the entire Vitest run.
    recoveryPool.on("error", (error) => recoveryPoolErrors.push(error));

    try {
      // Keep one client checked out so the server-side termination is observed
      // by that exact query instead of being transparently hidden by pool
      // replacement of an idle connection.
      const interruptedClient = await recoveryPool.connect();
      let backendPid: number | undefined;
      try {
        const backend = await interruptedClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        backendPid = backend.rows[0]?.pid;
        if (backendPid === undefined) throw new Error("Could not resolve the PostgreSQL backend PID");
        await admin!.query("SELECT pg_terminate_backend($1)", [backendPid]);

        let postgresInterruption: unknown;
        // pg_terminate_backend is asynchronous: the signal can arrive just
        // after an immediately-issued query. Retry on the same checked-out
        // client until the server closes that backend, with a bounded wait.
        for (let attempt = 0; attempt < 40 && postgresInterruption === undefined; attempt += 1) {
          try {
            await interruptedClient.query("SELECT 1");
            await new Promise((resolve) => setTimeout(resolve, 25));
          } catch (error) {
            postgresInterruption = error;
          }
        }
        expect(postgresInterruption).toBeDefined();
      } finally {
        interruptedClient.release();
      }

      let recoveredBackend: { rows: Array<{ pid: number }> } | undefined;
      // The first request after releasing a terminated client can race the
      // pool's idle-client error handler. Retry until pg-pool has discarded
      // that client and established a fresh backend.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          recoveredBackend = await recoveryPool.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
          if (recoveredBackend.rows[0]?.pid !== backendPid) break;
        } catch {
          recoveredBackend = undefined;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(recoveredBackend?.rows[0]?.pid).toBeDefined();
      expect(recoveredBackend?.rows[0]?.pid).not.toBe(backendPid);
      expect(await recoveryPool.query("SELECT 1")).toBeTruthy();

      // Drop only this application's Redis connection while PostgreSQL remains healthy.
      redis.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 50));
      const redisDown = await request("/api/health/ready");
      expect(redisDown.status).toBe(503);
      expect(await redisDown.json()).toEqual({
        status: "degraded",
        checks: { postgres: true, redis: false },
      });

      await waitForRedisReady(redis);
      expect(await redis.ping()).toBe("PONG");
      const recovered = await request("/api/health/ready");
      expect(recovered.status).toBe(200);
      expect(await recovered.json()).toEqual({
        status: "ready",
        checks: { postgres: true, redis: true },
      });
    } finally {
      await recoveryPool.end();
      if (redis.status !== "ready") {
        await waitForRedisReady(redis);
        await redis.ping();
      }
    }
  });

  it("cleans only safely expired sessions, cascades token history and reports audit-log growth", async () => {
    const active = await register(randomUUID());
    const expired = await register(randomUUID());
    const rotated = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: expired.cookie },
    });
    expect(rotated.status).toBe(200);

    const expiredSession = await pool.query<{ id: string }>(
      "SELECT id FROM player_sessions WHERE user_id = $1",
      [expired.body.user.id],
    );
    expect(expiredSession.rows).toHaveLength(1);
    const expiredSessionId = expiredSession.rows[0]?.id;
    if (!expiredSessionId) throw new Error("Expected one expired player session");
    const historyBefore = await pool.query(
      "SELECT token_hash FROM refresh_token_history WHERE session_id = $1",
      [expiredSessionId],
    );
    expect(historyBefore.rows).toHaveLength(1);
    const refreshAuditRows = await pool.query(
      "SELECT id FROM audit_logs WHERE user_id = $1 AND action = 'refresh_token_rotated'",
      [expired.body.user.id],
    );
    expect(refreshAuditRows.rows).toHaveLength(0);

    await pool.query("ANALYZE audit_logs");
    await pool.query("ANALYZE refresh_token_history");
    await pool.query(
      "UPDATE player_sessions SET expires_at = now() - interval '8 days' WHERE id = $1",
      [expiredSessionId],
    );
    const { runSessionMaintenance } = await import("../modules/auth/sessionMaintenance.js");
    const metrics = await runSessionMaintenance();
    expect(metrics).not.toBeNull();
    expect(metrics!.deletedSessions).toBeGreaterThanOrEqual(1);
    expect(BigInt(metrics!.auditLogRowsEstimate)).toBeGreaterThan(0n);
    expect(BigInt(metrics!.auditLogBytes)).toBeGreaterThan(0n);
    expect(BigInt(metrics!.refreshHistoryRowsEstimate)).toBeGreaterThan(0n);
    expect(BigInt(metrics!.refreshHistoryBytes)).toBeGreaterThan(0n);

    const removed = await pool.query("SELECT id FROM player_sessions WHERE id = $1", [expiredSessionId]);
    expect(removed.rows).toHaveLength(0);
    const cascadedHistory = await pool.query(
      "SELECT token_hash FROM refresh_token_history WHERE session_id = $1",
      [expiredSessionId],
    );
    expect(cascadedHistory.rows).toHaveLength(0);
    const activeSession = await pool.query(
      "SELECT id FROM player_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [active.body.user.id],
    );
    expect(activeSession.rows).toHaveLength(1);
    const preservedAudit = await pool.query(
      "SELECT action FROM audit_logs WHERE user_id = $1 AND action = 'register'",
      [expired.body.user.id],
    );
    expect(preservedAudit.rows).toHaveLength(1);
  });

  it("rejects cross-origin refresh attempts without changing the active session", async () => {
    const created = await register(randomUUID());
    const response = await request("/api/auth/refresh", {
      method: "POST",
      headers: { cookie: created.cookie, origin: "https://attacker.example" },
    });
    expect(response.status).toBe(403);
    const active = await pool.query(
      "SELECT revoked_at FROM player_sessions WHERE user_id = $1 AND revoked_at IS NULL",
      [created.body.user.id],
    );
    expect(active.rows).toHaveLength(1);
    expect(active.rows[0].revoked_at).toBeNull();
  });

  it("logout with a pre-rotation cookie revokes the same stable session", async () => {
    const created = await register(randomUUID());
    const rotated = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(rotated.status).toBe(200);
    const body = await rotated.json() as { accessToken: string };
    const claims = (await import("../lib/tokens.js")).verifyAccess(body.accessToken);
    expect(claims?.sessionId).toBeTruthy();

    const logout = await request("/api/auth/logout", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(logout.status).toBe(204);

    const session = await pool.query(
      "SELECT revoked_at FROM player_sessions WHERE id = $1",
      [claims!.sessionId],
    );
    expect(session.rows[0]?.revoked_at).not.toBeNull();
    const protectedRequest = await request("/api/me", {
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(protectedRequest.status).toBe(401);
  });

  it("revokes the active session on logout and records the Redis revocation marker", async () => {
    const created = await register(randomUUID());
    const claims = (await import("../lib/tokens.js")).verifyAccess(created.body.accessToken);
    expect(claims?.sessionId).toBeTruthy();

    const logout = await request("/api/auth/logout", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(logout.status).toBe(204);

    const session = await pool.query("SELECT revoked_at FROM player_sessions WHERE id = $1", [claims!.sessionId]);
    expect(session.rows[0]?.revoked_at).not.toBeNull();
    expect(await redis.get(`revoked-session:${claims!.sessionId}`)).toBe("1");

    const protectedRequest = await request("/api/me", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect(protectedRequest.status).toBe(401);
  });

  it("reconnects players, replaces duplicate sockets and replicates remote animation state", async () => {
    const alice = await register(randomUUID());
    const bob = await register(randomUUID());
    const { SOCKET_EVENTS: E } = await import("@bw/shared");

    const connectPlayer = async (token: string, url = baseUrl) => {
      const socket = createSocket(url, {
        auth: { token }, transports: ["websocket"], reconnection: false,
      });
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
      });
      return socket;
    };
    const joinPlayer = async (socket: ClientSocket) => new Promise<{ regionId: string; position: [number, number, number]; yaw: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for region:joined")), 5000);
      socket.once(E.serverJoined, (message) => { clearTimeout(timer); resolve(message); });
      socket.emit(E.clientJoin, { regionId: "temple_complex" });
    });

    const aliceSocket = await connectPlayer(alice.body.accessToken);
    const bobSocket = await connectPlayer(bob.body.accessToken);
    await Promise.all([joinPlayer(aliceSocket), joinPlayer(bobSocket)]);

    await new Promise((resolve) => setTimeout(resolve, 80));
    aliceSocket.emit(E.clientState, {
      p: [0, 1.2, 19.7], yaw: Math.PI, anim: "walk", seq: 1,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        bobSocket.off(E.serverState, onState);
        reject(new Error("Remote player animation snapshot was not received"));
      }, 5000);
      const onState = (players: Array<{ id: string; anim: string }>) => {
        if (players.some((player) => player.id === alice.body.user.id && player.anim === "walk")) {
          clearTimeout(timer);
          bobSocket.off(E.serverState, onState);
          resolve();
        }
      };
      bobSocket.on(E.serverState, onState);
    });

    // Simulate the authoritative player snapshot at the requested checkpoint.
    await setPresence(alice.body.user.id, [-18, 1.2, 4]);
    const checkpoint = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${alice.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(checkpoint.status).toBe(204);
    const checkpointLocation = await pool.query<{ x: number; y: number; z: number; yaw: number }>(
      "SELECT x, y, z, yaw FROM player_locations WHERE user_id = $1", [alice.body.user.id],
    );
    expect(checkpointLocation.rows[0]).toBeTruthy();

    aliceSocket.disconnect();
    // Disconnect persistence must not overwrite a newer checkpoint with an older movement timestamp.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (!(await redis.get(`socket-owner:${alice.body.user.id}`))) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const reconnected = await connectPlayer(alice.body.accessToken);
    const restored = await joinPlayer(reconnected);
    expect(restored.regionId).toBe("temple_complex");
    expect(restored.position[0]).toBeCloseTo(Number(checkpointLocation.rows[0]!.x), 2);
    expect(restored.position[1]).toBeCloseTo(Number(checkpointLocation.rows[0]!.y), 2);
    expect(restored.position[2]).toBeCloseTo(Number(checkpointLocation.rows[0]!.z), 2);
    expect(restored.yaw).toBeCloseTo(Number(checkpointLocation.rows[0]!.yaw), 4);
    const checkpointAfterDisconnect = await pool.query("SELECT spawn_id FROM player_locations WHERE user_id = $1", [alice.body.user.id]);
    expect(checkpointAfterDisconnect.rows[0].spawn_id).toBe("lotus_pond");

    const duplicate = await connectPlayer(alice.body.accessToken);
    await new Promise<void>((resolve, reject) => {
      if (!reconnected.connected) return resolve();
      const timer = setTimeout(() => reject(new Error("Older duplicate socket was not disconnected")), 3000);
      reconnected.once("disconnect", () => { clearTimeout(timer); resolve(); });
    });
    await joinPlayer(duplicate);
    expect(duplicate.connected).toBe(true);
  }, 20_000);


  it("rejoining the current region preserves the latest authoritative player position", async () => {
    const player = await register(randomUUID());
    const { SOCKET_EVENTS: E } = await import("@bw/shared");
    const socket = createSocket(baseUrl, {
      auth: { token: player.body.accessToken }, transports: ["websocket"], reconnection: false,
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const join = () => new Promise<{ regionId: string; position: [number, number, number]; yaw: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for region join")), 5000);
      socket.once(E.serverJoined, (message) => { clearTimeout(timer); resolve(message); });
      socket.emit(E.clientJoin, { regionId: "temple_complex" });
    });
    await join();

    await new Promise((resolve) => setTimeout(resolve, 80));
    socket.emit(E.clientState, { p: [0, 1.2, 19.7], yaw: Math.PI, anim: "walk", seq: 1 });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const presence = await redis.hgetall(`presence:${player.body.user.id}`);
      if (Number(presence.z) < 19.8 && Number(presence.z) > 19.6) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const rejoined = await join();
    expect(rejoined.regionId).toBe("temple_complex");
    expect(rejoined.position[2]).toBeCloseTo(19.7, 1);
  }, 12_000);

  it("does not refresh or replicate stale presence after a socket lease is replaced", async () => {
    const alice = await register(randomUUID());
    const bob = await register(randomUUID());
    const { SOCKET_EVENTS: E } = await import("@bw/shared");

    const connectPlayer = async (token: string) => {
      const socket = createSocket(baseUrl, {
        auth: { token }, transports: ["websocket"], reconnection: false,
      });
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    };
    const joinPlayer = async (socket: ClientSocket) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for region join")), 5000);
      socket.once(E.serverJoined, () => { clearTimeout(timer); resolve(); });
      socket.emit(E.clientJoin, { regionId: "temple_complex" });
    });

    const aliceSocket = await connectPlayer(alice.body.accessToken);
    const bobSocket = await connectPlayer(bob.body.accessToken);
    await Promise.all([joinPlayer(aliceSocket), joinPlayer(bobSocket)]);

    const presenceKey = `presence:${alice.body.user.id}`;
    const ownerKey = `socket-owner:${alice.body.user.id}`;
    const before = await redis.hgetall(presenceKey);
    expect(before.ownerToken).toBeTruthy();
    const replacementToken = randomUUID();
    await redis.set(ownerKey, replacementToken, "PX", 60_000);

    // The old socket's heartbeat must renew neither its old presence nor its region membership.
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const after = await redis.hgetall(presenceKey);
    expect(after.ownerToken).toBe(before.ownerToken);
    expect(after.heartbeatAt).toBe(before.heartbeatAt);
    expect(await redis.get(ownerKey)).toBe(replacementToken);
    expect(await redis.sismember("presence-region:temple_complex", alice.body.user.id)).toBe(0);
  }, 15_000);

  it("replicates player state, hands off socket ownership and broadcasts chat across separate Node processes", async () => {
    const portProbe = createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
    const workerAddress = portProbe.address();
    if (!workerAddress || typeof workerAddress === "string") throw new Error("Could not allocate gateway worker port");
    const workerPort = workerAddress.port;
    await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
    gatewayWorker = spawn(process.execPath, ["--import", "tsx/esm", fileURLToPath(new URL("./gateway-worker.ts", import.meta.url))], {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      env: { ...process.env, BW_GATEWAY_TEST_PORT: String(workerPort) },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Separate gateway process did not become ready")), 10_000);
      gatewayWorker!.stdout!.on("data", (chunk: Buffer) => {
        output += chunk.toString();
        if (output.includes("BW_GATEWAY_READY")) { clearTimeout(timer); resolve(); }
      });
      gatewayWorker!.stderr!.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      gatewayWorker!.once("error", (error) => { clearTimeout(timer); reject(error); });
      gatewayWorker!.once("exit", (code) => {
        if (!output.includes("BW_GATEWAY_READY")) { clearTimeout(timer); reject(new Error(`Gateway worker exited early (${code}): ${output}`)); }
      });
    });
    secondBaseUrl = `http://127.0.0.1:${workerPort}`;

    // Exercise cookie/session mutations through two independent Node HTTP gateways.
    const loginPlayer = await register(randomUUID());
    const loginEmail = (await pool.query("SELECT email FROM users WHERE id = $1", [loginPlayer.body.user.id])).rows[0].email;
    const loginAt = (url: string) => requestAt(url, "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: "Integration-password-2026!" }),
    });
    const [loginA, loginB] = await Promise.all([loginAt(baseUrl), loginAt(secondBaseUrl)]);
    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);
    const loginAAccess = (await loginA.json() as { accessToken: string }).accessToken;
    const loginBAccess = (await loginB.json() as { accessToken: string }).accessToken;
    const loginChecks = await Promise.all([
      requestAt(baseUrl, "/api/me", { headers: { authorization: `Bearer ${loginAAccess}` } }),
      requestAt(secondBaseUrl, "/api/me", { headers: { authorization: `Bearer ${loginBAccess}` } }),
    ]);
    expect(loginChecks.map((response) => response.status).sort()).toEqual([200, 401]);
    const loginActive = await pool.query(
      "SELECT id FROM player_sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()",
      [loginPlayer.body.user.id],
    );
    expect(loginActive.rows).toHaveLength(1);

    // Product policy is intentionally single-active-session: a later login
    // from another device/gateway replaces the previous device's session.
    const sequentialA = await loginAt(baseUrl);
    const sequentialAAccess = (await sequentialA.json() as { accessToken: string }).accessToken;
    const sequentialB = await loginAt(secondBaseUrl);
    const sequentialBAccess = (await sequentialB.json() as { accessToken: string }).accessToken;
    expect((await requestAt(baseUrl, "/api/me", {
      headers: { authorization: `Bearer ${sequentialAAccess}` },
    })).status).toBe(401);
    expect((await requestAt(secondBaseUrl, "/api/me", {
      headers: { authorization: `Bearer ${sequentialBAccess}` },
    })).status).toBe(200);

    const refreshPlayer = await register(randomUUID());
    const refreshAt = (url: string) => requestAt(url, "/api/auth/refresh", {
      method: "POST", headers: { cookie: refreshPlayer.cookie },
    });
    const [refreshA, refreshB] = await Promise.all([refreshAt(baseUrl), refreshAt(secondBaseUrl)]);
    expect([refreshA.status, refreshB.status].sort()).toEqual([200, 409]);
    const successfulRefresh = refreshA.status === 200 ? refreshA : refreshB;
    const refreshBody = await successfulRefresh.json() as { accessToken: string };
    const refreshSession = await pool.query(
      "SELECT id, revoked_at FROM player_sessions WHERE user_id = $1",
      [refreshPlayer.body.user.id],
    );
    expect(refreshSession.rows).toHaveLength(1);
    expect(refreshSession.rows[0].revoked_at).toBeNull();
    expect((await requestAt(baseUrl, "/api/me", {
      headers: { authorization: `Bearer ${refreshBody.accessToken}` },
    })).status).toBe(200);

    // A replay outside the concurrency grace window is still treated as theft.
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.REFRESH_ROTATION_GRACE_MS) + 50));
    const replayedRefresh = await requestAt(secondBaseUrl, "/api/auth/refresh", {
      method: "POST", headers: { cookie: refreshPlayer.cookie },
    });
    expect(replayedRefresh.status).toBe(401);
    const replayedSession = await pool.query(
      "SELECT revoked_at FROM player_sessions WHERE id = $1",
      [refreshSession.rows[0].id],
    );
    expect(replayedSession.rows[0].revoked_at).not.toBeNull();

    const logoutPlayer = await register(randomUUID());
    const rotatedOnB = await requestAt(secondBaseUrl, "/api/auth/refresh", {
      method: "POST", headers: { cookie: logoutPlayer.cookie },
    });
    expect(rotatedOnB.status).toBe(200);
    const rotatedAccess = (await rotatedOnB.json() as { accessToken: string }).accessToken;
    const logoutOnA = await requestAt(baseUrl, "/api/auth/logout", {
      method: "POST", headers: { cookie: logoutPlayer.cookie },
    });
    expect(logoutOnA.status).toBe(204);
    expect((await requestAt(secondBaseUrl, "/api/me", {
      headers: { authorization: `Bearer ${rotatedAccess}` },
    })).status).toBe(401);

    const alice = await register(randomUUID());
    const bob = await register(randomUUID());
    const { SOCKET_EVENTS: E, TICK_RATE_HZ } = await import("@bw/shared");

    const connectTo = async (token: string, url: string) => {
      const socket = createSocket(url, {
        auth: { token }, transports: ["websocket"], reconnection: false,
      });
      clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    };
    const join = (socket: ClientSocket) => new Promise<{ regionId: string; position: [number, number, number]; yaw: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out joining region on gateway")), 5000);
      socket.once(E.serverJoined, (message) => { clearTimeout(timer); resolve(message); });
      socket.emit(E.clientJoin, { regionId: "temple_complex" });
    });

    const aliceSocket = await connectTo(alice.body.accessToken, baseUrl);
    const bobSocket = await connectTo(bob.body.accessToken, secondBaseUrl);
    const [aliceSpawn] = await Promise.all([join(aliceSocket), join(bobSocket)]);

    const received = new Promise<{ text: string; from: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Redis adapter did not forward region chat")), 5000);
      bobSocket.once(E.serverChat, (message: { text: string; from: string }) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    aliceSocket.emit(E.clientChat, { text: "cross-instance-chat-check" });
    await expect(received).resolves.toMatchObject({ text: "cross-instance-chat-check" });

    const remoteMovement = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Redis presence did not replicate remote player movement")), 5000);
      const onState = (players: Array<{ id: string; anim: string }>) => {
        if (players.some((player) => player.id === alice.body.user.id && player.anim === "walk")) {
          clearTimeout(timer);
          bobSocket.off(E.serverState, onState);
          resolve();
        }
      };
      bobSocket.on(E.serverState, onState);
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    aliceSocket.emit(E.clientState, {
      p: aliceSpawn.position, yaw: aliceSpawn.yaw, anim: "walk", seq: 1,
    });
    await remoteMovement;

    // Hold the durable authority row as an in-flight gameplay mutation would.
    // A second gateway must not complete its ownership claim until this transaction commits.
    const oldAuthority = await pool.query<{ owner_token: string; owner_epoch: string }>(
      "SELECT owner_token, owner_epoch FROM socket_owner_authority WHERE user_id = $1",
      [alice.body.user.id],
    );
    expect(oldAuthority.rows[0]).toBeTruthy();
    const inFlightMutation = await pool.connect();
    await inFlightMutation.query("BEGIN");
    await inFlightMutation.query(
      "SELECT user_id FROM socket_owner_authority WHERE user_id = $1 FOR UPDATE",
      [alice.body.user.id],
    );
    let takeoverSettled = false;
    const takeoverPromise = connectTo(alice.body.accessToken, secondBaseUrl)
      .then((socket) => { takeoverSettled = true; return socket; })
      .catch((error) => { takeoverSettled = true; throw error; });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(takeoverSettled).toBe(false);
    await inFlightMutation.query("COMMIT");
    inFlightMutation.release();

    const replacement = await takeoverPromise;
    const replacementAuthority = await pool.query<{ owner_token: string; owner_epoch: string }>(
      "SELECT owner_token, owner_epoch FROM socket_owner_authority WHERE user_id = $1",
      [alice.body.user.id],
    );
    expect(replacementAuthority.rows[0]?.owner_token).not.toBe(oldAuthority.rows[0]!.owner_token);
    expect(Number(replacementAuthority.rows[0]?.owner_epoch)).toBeGreaterThan(Number(oldAuthority.rows[0]!.owner_epoch));
    await new Promise<void>((resolve, reject) => {
      if (!aliceSocket.connected) return resolve();
      const timer = setTimeout(() => reject(new Error("Old gateway socket was not revoked after cross-instance handoff")), 5000);
      aliceSocket.once("disconnect", () => { clearTimeout(timer); resolve(); });
    });
    const replacementSpawn = await join(replacement);
    expect(replacementSpawn.regionId).toBe("temple_complex");
    expect(replacementSpawn.position).toEqual(aliceSpawn.position);
    expect(await redis.get(`socket-owner:${alice.body.user.id}`)).toBeTruthy();

    // Race two logins against separate Node processes. The last Redis lease
    // owner must be the only socket allowed to publish presence or movement.
    const racingResults = await Promise.all([
      connectTo(alice.body.accessToken, baseUrl).then((socket) => socket, () => null),
      connectTo(alice.body.accessToken, secondBaseUrl).then((socket) => socket, () => null),
    ]);
    // The losing handshake may be rejected with realtime_ownership_replaced;
    // that is an expected outcome, not a test failure.
    const racingSockets = racingResults.filter((socket): socket is ClientSocket => socket !== null);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const activeRacers = racingSockets.filter((candidate) => candidate.connected);
    expect(activeRacers).toHaveLength(1);
    const raceWinner = activeRacers[0]!;
    await join(raceWinner);
    const ownerKey = `socket-owner:${alice.body.user.id}`;
    const presenceKey = `presence:${alice.body.user.id}`;
    const winnerLease = await redis.get(ownerKey);
    const winnerEpoch = Number(await redis.get(`socket-owner-epoch:${alice.body.user.id}`));
    const winnerPresence = await redis.hgetall(presenceKey);
    const durableWinner = await pool.query<{ owner_token: string; owner_epoch: string }>(
      "SELECT owner_token, owner_epoch FROM socket_owner_authority WHERE user_id = $1",
      [alice.body.user.id],
    );
    expect(winnerLease).toBeTruthy();
    expect(winnerPresence.socketId).toBe(raceWinner.id);
    expect(winnerPresence.ownerToken).toBe(winnerLease);
    expect(Number(winnerPresence.ownerEpoch)).toBe(winnerEpoch);
    expect(durableWinner.rows[0]?.owner_token).toBe(winnerLease);
    expect(Number(durableWinner.rows[0]?.owner_epoch)).toBe(winnerEpoch);

    // The previous gateway's fencing tuple cannot begin a new mutation after takeover.
    const staleMutation = await pool.connect();
    try {
      await staleMutation.query("BEGIN");
      const { lockSocketOwnership } = await import("../modules/me/socketOwnership.js");
      expect(await lockSocketOwnership(staleMutation, alice.body.user.id, {
        ownerToken: oldAuthority.rows[0]!.owner_token,
        ownerEpoch: Number(oldAuthority.rows[0]!.owner_epoch),
      })).toBe(false);
      await staleMutation.query("ROLLBACK");
    } finally { staleMutation.release(); }

    // An old socket's delayed disconnect and movement cannot erase or replace
    // the current owner's Redis presence.
    if (replacement.connected) {
      replacement.emit(E.clientState, { p: [0, 1.2, 18], yaw: 0, anim: "run", seq: 99 });
      replacement.disconnect();
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stablePresence = await redis.hgetall(presenceKey);
    expect(stablePresence.socketId).toBe(raceWinner.id);
    expect(await redis.get(ownerKey)).toBe(winnerLease);

    raceWinner.disconnect();
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (!(await redis.get(ownerKey))) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(await redis.get(ownerKey)).toBeNull();

    // Verify the SQL fencing predicate rejects a delayed persistence write
    // from an older owner epoch, even if that write carries a later timestamp.
    let savedOwnerEpoch = 0;
    let savedX = 0;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const saved = await pool.query<{ owner_epoch: string; x: number }>(
        "SELECT owner_epoch, x FROM player_locations WHERE user_id = $1", [alice.body.user.id],
      );
      if (saved.rows[0] && Number(saved.rows[0].owner_epoch) > 0) {
        savedOwnerEpoch = Number(saved.rows[0].owner_epoch);
        savedX = saved.rows[0].x;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(savedOwnerEpoch).toBeGreaterThan(0);
    const staleLocationWrite = await pool.query(
      "UPDATE player_locations SET x = $2 WHERE user_id = $1 AND owner_epoch <= $3",
      [alice.body.user.id, savedX + 500, savedOwnerEpoch - 1],
    );
    expect(staleLocationWrite.rowCount).toBe(0);
    const afterStaleWrite = await pool.query(
      "SELECT owner_epoch, x FROM player_locations WHERE user_id = $1", [alice.body.user.id],
    );
    expect(Number(afterStaleWrite.rows[0].owner_epoch)).toBe(savedOwnerEpoch);
    expect(afterStaleWrite.rows[0].x).toBe(savedX);

    // Staged realtime load ramp across two independent Node.js Gateway processes.
    // Each stage holds all connected clients, sends 10Hz movement and measures
    // snapshot cadence, Redis CPU/memory/network/commands and Redis PING latency.
    const loadSockets: ClientSocket[] = [];
    const loadSpawns: Array<{ regionId: string; position: [number, number, number]; yaw: number }> = [];
    const loadSequences: number[] = [];
    const snapshotTimes = new Map<ClientSocket, number[]>();
    const parseInfo = (raw: string) => Object.fromEntries(raw.split("\r\n")
      .filter((line) => line && !line.startsWith("#") && line.includes(":"))
      .map((line) => { const split = line.indexOf(":"); return [line.slice(0, split), Number(line.slice(split + 1))]; }));
    const percentile = (values: number[], p: number) => {
      const sorted = [...values].sort((x, y) => x - y);
      return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : null;
    };
    const redisMetrics = async () => {
      const [statsRaw, memoryRaw, cpuRaw] = await Promise.all([
        redis.info("stats"), redis.info("memory"), redis.info("cpu"),
      ]);
      return { stats: parseInfo(statsRaw), memory: parseInfo(memoryRaw), cpu: parseInfo(cpuRaw) };
    };
    const workerMetrics = () => new Promise<{ cpu: NodeJS.CpuUsage; memory: NodeJS.MemoryUsage }>((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => reject(new Error("Timed out sampling secondary Gateway process resources")), 2_000);
      const onMessage = (message: unknown) => {
        if (!message || typeof message !== "object" || (message as { id?: string }).id !== id) return;
        clearTimeout(timer);
        gatewayWorker!.off("message", onMessage);
        const result = message as { cpu: NodeJS.CpuUsage; memory: NodeJS.MemoryUsage };
        resolve(result);
      };
      gatewayWorker!.on("message", onMessage);
      gatewayWorker!.send({ type: "metrics", id });
    });
    const stages: Array<Record<string, number | null>> = [];
    let connected = 0;
    for (const target of [10, 25, 50, 100]) {
      const added = target - connected;
      if (added > 0) {
        const users = await Promise.all(Array.from({ length: added }, () => register(randomUUID())));
        const sockets = await Promise.all(users.map((player, index) =>
          connectTo(player.body.accessToken, (connected + index) % 2 === 0 ? baseUrl : secondBaseUrl)));
        const spawns = await Promise.all(sockets.map((socket) => join(socket)));
        for (let index = 0; index < sockets.length; index += 1) {
          const socket = sockets[index]!;
          loadSockets.push(socket);
          loadSpawns.push(spawns[index]!);
          loadSequences.push(0);
          snapshotTimes.set(socket, []);
          socket.on(E.serverState, () => snapshotTimes.get(socket)!.push(Date.now()));
        }
        connected = target;
      }

      const before = await redisMetrics();
      const workerBefore = await workerMetrics();
      const mainCpuBefore = process.cpuUsage();
      const mainMemoryBefore = process.memoryUsage();
      const cpuBefore = Number(before.cpu.used_cpu_user ?? 0) + Number(before.cpu.used_cpu_sys ?? 0);
      const commandsBefore = Number(before.stats.total_commands_processed ?? 0);
      const netInBefore = Number(before.stats.total_net_input_bytes ?? 0);
      const netOutBefore = Number(before.stats.total_net_output_bytes ?? 0);
      const memoryBefore = Number(before.memory.used_memory ?? 0);
      const pingSamples: number[] = [];
      const startedAt = Date.now();
      const emitTimer = setInterval(() => {
        loadSockets.forEach((socket, index) => {
          loadSequences[index] = loadSequences[index]! + 1;
          socket.emit(E.clientState, {
            p: loadSpawns[index]!.position, yaw: loadSpawns[index]!.yaw,
            anim: "walk", seq: loadSequences[index]!,
          });
        });
      }, 100);
      const sampleTimer = setInterval(async () => {
        const pingStarted = performance.now();
        try { await redis.ping(); pingSamples.push(performance.now() - pingStarted); } catch { /* captured by final ping check */ }
      }, 100);
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      clearInterval(emitTimer);
      clearInterval(sampleTimer);
      await redis.ping();
      const durationMs = Date.now() - startedAt;
      const after = await redisMetrics();
      const workerAfter = await workerMetrics();
      const mainCpuDelta = process.cpuUsage(mainCpuBefore);
      const mainMemoryAfter = process.memoryUsage();
      const cpuAfter = Number(after.cpu.used_cpu_user ?? 0) + Number(after.cpu.used_cpu_sys ?? 0);
      const commandsAfter = Number(after.stats.total_commands_processed ?? 0);
      const netInAfter = Number(after.stats.total_net_input_bytes ?? 0);
      const netOutAfter = Number(after.stats.total_net_output_bytes ?? 0);
      const allIntervals = loadSockets.flatMap((socket) => {
        const times = snapshotTimes.get(socket) ?? [];
        const recent = times.filter((time) => time >= startedAt);
        return recent.slice(1).map((time, index) => time - recent[index]!);
      });
      const stage = {
        clients: target,
        durationMs,
        snapshotEvents: loadSockets.reduce((sum, socket) =>
          sum + (snapshotTimes.get(socket)?.filter((time) => time >= startedAt).length ?? 0), 0),
        snapshotIntervalsMsP50: percentile(allIntervals, 0.5),
        snapshotIntervalsMsP95: percentile(allIntervals, 0.95),
        redisPingMsP50: percentile(pingSamples, 0.5),
        redisPingMsP95: percentile(pingSamples, 0.95),
        redisCpuCorePercent: Number(((cpuAfter - cpuBefore) / (durationMs / 1000) * 100).toFixed(2)),
        redisCommandsPerSecond: Math.round((commandsAfter - commandsBefore) / (durationMs / 1000)),
        redisNetworkInBytesPerSecond: Math.round((netInAfter - netInBefore) / (durationMs / 1000)),
        redisNetworkOutBytesPerSecond: Math.round((netOutAfter - netOutBefore) / (durationMs / 1000)),
        redisMemoryDeltaBytes: Number(after.memory.used_memory ?? 0) - memoryBefore,
        redisMemoryPeakBytes: Number(after.memory.used_memory_peak ?? 0),
        primaryNodeCpuUserMs: Math.round((mainCpuDelta.user / 1000) * 100) / 100,
        primaryNodeCpuSystemMs: Math.round((mainCpuDelta.system / 1000) * 100) / 100,
        primaryNodeCpuCorePercent: Number((((mainCpuDelta.user + mainCpuDelta.system) / (durationMs * 1000)) * 100).toFixed(2)),
        primaryNodeRssBytes: mainMemoryAfter.rss,
        primaryNodeRssDeltaBytes: mainMemoryAfter.rss - mainMemoryBefore.rss,
        primaryNodeHeapUsedBytes: mainMemoryAfter.heapUsed,
        secondaryGatewayCpuUserMs: Math.round(((workerAfter.cpu.user - workerBefore.cpu.user) / 1000) * 100) / 100,
        secondaryGatewayCpuSystemMs: Math.round(((workerAfter.cpu.system - workerBefore.cpu.system) / 1000) * 100) / 100,
        secondaryGatewayCpuCorePercent: Number((((workerAfter.cpu.user - workerBefore.cpu.user + workerAfter.cpu.system - workerBefore.cpu.system) / (durationMs * 1000)) * 100).toFixed(2)),
        secondaryGatewayRssBytes: workerAfter.memory.rss,
        secondaryGatewayRssDeltaBytes: workerAfter.memory.rss - workerBefore.memory.rss,
        secondaryGatewayHeapUsedBytes: workerAfter.memory.heapUsed,
      };
      stages.push(stage);
      console.info("BW_REALTIME_LOAD_STAGE", JSON.stringify(stage));
      expect(stage.snapshotEvents).toBeGreaterThan(target * 15);
      expect(stage.redisPingMsP95).not.toBeNull();
    }
    console.info("BW_REALTIME_LOAD_RAMP_RESULT", JSON.stringify({
      gatewayProcesses: 2, ramp: stages, tickRateHz: TICK_RATE_HZ, clientSendHz: 10,
    }));
    loadSockets.forEach((socket) => socket.disconnect());

    // Simulate loss of the primary Redis command connection. The affected
    // gateway must fail closed for socket events rather than accept stale work.
    const redisProbe = await register(randomUUID());
    const redisProbeSocket = await connectTo(redisProbe.body.accessToken, baseUrl);
    await join(redisProbeSocket);
    const redisDisconnected = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket did not fail closed during Redis loss")), 2_000);
      redisProbeSocket.once("disconnect", () => { clearTimeout(timer); resolve(); });
    });
    const originalEval = redis.eval;
    try {
      // Fail the shared command path without closing the singleton client used
      // by later tests; the gateway must disconnect rather than accept stale work.
      redis.eval = (() => Promise.reject(Object.assign(
        new Error("simulated Redis command connection loss"),
        { code: "ECONNRESET" },
      ))) as typeof redis.eval;
      redisProbeSocket.emit(E.clientChat, { text: "must-not-be-accepted-during-redis-loss" });
      await redisDisconnected;
    } finally {
      redis.eval = originalEval;
    }

    // The worker owns Bob's socket. A hard process crash must leave a bounded
    // lease that expires, after which another gateway can accept the reconnect.
    gatewayWorker!.kill("SIGKILL");
    await new Promise<void>((resolve) => gatewayWorker!.once("exit", () => resolve()));
    await new Promise((resolve) => setTimeout(resolve, 3_300));
    expect(await redis.get(`socket-owner:${bob.body.user.id}`)).toBeNull();
    expect(await redis.hgetall(`presence:${bob.body.user.id}`)).toEqual({});
    const bobReconnect = await connectTo(bob.body.accessToken, baseUrl);
    const bobSpawn = await join(bobReconnect);
    expect(bobSpawn.regionId).toBe("temple_complex");
    expect(await redis.get(`socket-owner:${bob.body.user.id}`)).toBeTruthy();
    bobReconnect.disconnect();
  }, 25_000);


  it.runIf(process.env.BW_REALTIME_SOAK === "1")(
    "survives a 50-player simultaneous reconnect storm across two Gateways",
    async () => {
      const portProbe = createServer();
      await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
      const address = portProbe.address();
      if (!address || typeof address === "string") throw new Error("Could not allocate reconnect worker port");
      const workerPort = address.port;
      await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
      gatewayWorker = spawn(process.execPath, ["--import", "tsx/esm", fileURLToPath(new URL("./gateway-worker.ts", import.meta.url))], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        env: { ...process.env, BW_GATEWAY_TEST_PORT: String(workerPort) }, stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      await new Promise<void>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error("Reconnect Gateway startup timeout")), 10_000);
        gatewayWorker!.stdout!.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes("BW_GATEWAY_READY")) { clearTimeout(timer); resolve(); }
        });
        gatewayWorker!.stderr!.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        gatewayWorker!.once("error", (error) => { clearTimeout(timer); reject(error); });
        gatewayWorker!.once("exit", (code) => {
          if (!output.includes("BW_GATEWAY_READY")) { clearTimeout(timer); reject(new Error("Reconnect Gateway exited: " + code + " " + output)); }
        });
      });
      secondBaseUrl = "http://127.0.0.1:" + workerPort;
      const { SOCKET_EVENTS: E } = await import("@bw/shared");
      const players = await Promise.all(Array.from({ length: 50 }, () => register(randomUUID())));
      const connectPlayer = async (token: string, url: string) => {
        const socket = createSocket(url, { auth: { token }, transports: ["websocket"], reconnection: false, timeout: 10_000 });
        clients.push(socket);
        await new Promise<void>((resolve, reject) => {
          socket.once("connect", resolve);
          socket.once("connect_error", reject);
        });
        return socket;
      };
      const joinPlayer = (socket: ClientSocket) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Reconnect-storm region join timeout")), 5_000);
        socket.once(E.serverJoined, () => { clearTimeout(timer); resolve(); });
        socket.emit(E.clientJoin, { regionId: "temple_complex" });
      });
      const initial = await Promise.all(players.map((player, i) =>
        connectPlayer(player.body.accessToken, i % 2 === 0 ? baseUrl : secondBaseUrl)));
      await Promise.all(initial.map(joinPlayer));
      expect(initial.every((socket) => socket.connected)).toBe(true);
      initial.forEach((socket) => socket.disconnect());

      const waitForNoOwners = async () => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const owners = await Promise.all(players.map((player) => redis.get("socket-owner:" + player.body.user.id)));
          if (owners.every((owner) => owner === null)) return true;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return false;
      };
      expect(await waitForNoOwners()).toBe(true);

      const reconnected = await Promise.all(players.map((player, i) =>
        connectPlayer(player.body.accessToken, i % 2 === 0 ? secondBaseUrl : baseUrl)));
      await Promise.all(reconnected.map(joinPlayer));
      expect(reconnected.every((socket) => socket.connected)).toBe(true);
      const validOwners = await Promise.all(players.map(async (player, i) => {
        const owner = await redis.get("socket-owner:" + player.body.user.id);
        const presence = await redis.hgetall("presence:" + player.body.user.id);
        return owner !== null && presence.socketId === reconnected[i]!.id && presence.ownerToken === owner;
      }));
      expect(validOwners.filter(Boolean)).toHaveLength(50);
      reconnected.forEach((socket) => socket.disconnect());
      expect(await waitForNoOwners()).toBe(true);
      console.info("BW_RECONNECT_STORM_RESULT", JSON.stringify({
        players: 50, gateways: 2, successfulReconnects: reconnected.length,
        singleOwnerValidated: validOwners.filter(Boolean).length,
      }));
    },
    120_000,
  );

  it.runIf(process.env.BW_REALTIME_SOAK === "1")(
    "holds 100 connected players for a 30-minute realtime soak with per-minute telemetry",
    async () => {
      if (Number(process.env.BW_REALTIME_SOAK_MINUTES ?? "30") !== 30) {
        throw new Error("BW_REALTIME_SOAK_MINUTES must be exactly 30");
      }
      const portProbe = createServer();
      await new Promise<void>((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
      const address = portProbe.address();
      if (!address || typeof address === "string") throw new Error("Could not allocate soak worker port");
      const workerPort = address.port;
      await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
      gatewayWorker = spawn(process.execPath, ["--import", "tsx/esm", fileURLToPath(new URL("./gateway-worker.ts", import.meta.url))], {
        cwd: fileURLToPath(new URL("../..", import.meta.url)),
        env: { ...process.env, BW_GATEWAY_TEST_PORT: String(workerPort) }, stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      await new Promise<void>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error("Soak Gateway startup timeout")), 10_000);
        gatewayWorker!.stdout!.on("data", (chunk: Buffer) => {
          output += chunk.toString();
          if (output.includes("BW_GATEWAY_READY")) { clearTimeout(timer); resolve(); }
        });
        gatewayWorker!.stderr!.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        gatewayWorker!.once("error", (error) => { clearTimeout(timer); reject(error); });
        gatewayWorker!.once("exit", (code) => {
          if (!output.includes("BW_GATEWAY_READY")) { clearTimeout(timer); reject(new Error("Soak Gateway exited: " + code + " " + output)); }
        });
      });
      secondBaseUrl = "http://127.0.0.1:" + workerPort;
      const { SOCKET_EVENTS: E, TICK_RATE_HZ } = await import("@bw/shared");
      const players = await Promise.all(Array.from({ length: 100 }, () => register(randomUUID())));
      const sockets = await Promise.all(players.map((player, i) => {
        const socket = createSocket(i % 2 === 0 ? baseUrl : secondBaseUrl, {
          auth: { token: player.body.accessToken }, transports: ["websocket"],
          reconnection: false, timeout: 10_000,
        });
        clients.push(socket);
        return new Promise<ClientSocket>((resolve, reject) => {
          socket.once("connect", () => resolve(socket));
          socket.once("connect_error", reject);
        });
      }));
      const spawns = await Promise.all(sockets.map((socket) => new Promise<{ position: [number, number, number]; yaw: number }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Soak player region join timeout")), 5_000);
        socket.once(E.serverJoined, (message) => { clearTimeout(timer); resolve(message); });
        socket.emit(E.clientJoin, { regionId: "temple_complex" });
      })));
      expect(sockets.every((socket) => socket.connected)).toBe(true);
      const receivedAt = sockets.map(() => [] as number[]);
      const sequences = sockets.map(() => 0);
      sockets.forEach((socket, i) => socket.on(E.serverState, () => receivedAt[i]!.push(Date.now())));
      const emitTimer = setInterval(() => sockets.forEach((socket, i) => {
        sequences[i] = sequences[i]! + 1;
        socket.emit(E.clientState, { p: spawns[i]!.position, yaw: spawns[i]!.yaw, anim: "walk", seq: sequences[i]! });
      }), 100);
      const parseInfo = (raw: string) => Object.fromEntries(raw.split("\r\n")
        .filter((line) => line && !line.startsWith("#") && line.includes(":"))
        .map((line) => { const p = line.indexOf(":"); return [line.slice(0, p), Number(line.slice(p + 1))]; }));
      const percentile = (values: number[], p: number) => {
        const sorted = [...values].sort((a, b) => a - b);
        return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : null;
      };
      const sampleWorker = () => new Promise<{ cpu: NodeJS.CpuUsage; memory: NodeJS.MemoryUsage }>((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => reject(new Error("Soak worker metrics timeout")), 2_000);
        const listener = (message: unknown) => {
          if (!message || typeof message !== "object" || (message as { id?: string }).id !== id) return;
          clearTimeout(timer);
          gatewayWorker!.off("message", listener);
          resolve(message as { cpu: NodeJS.CpuUsage; memory: NodeJS.MemoryUsage });
        };
        gatewayWorker!.on("message", listener);
        gatewayWorker!.send({ type: "metrics", id });
      });
      const reports: Array<Record<string, number | null | boolean>> = [];
      const started = Date.now();
      try {
        for (let minute = 1; minute <= 30; minute += 1) {
          const windowStart = Date.now();
          const mainCpu = process.cpuUsage();
          const mainMemory = process.memoryUsage();
          const workerBefore = await sampleWorker();
          const [statsBeforeRaw, memoryBeforeRaw, cpuBeforeRaw] = await Promise.all([
            redis.info("stats"), redis.info("memory"), redis.info("cpu"),
          ]);
          const statsBefore = parseInfo(statsBeforeRaw);
          const memoryBefore = parseInfo(memoryBeforeRaw);
          const cpuBefore = parseInfo(cpuBeforeRaw);
          const pings: number[] = [];
          const pingTimer = setInterval(async () => {
            const t = performance.now();
            try { await redis.ping(); pings.push(performance.now() - t); } catch { /* health assertion below */ }
          }, 250);
          await new Promise((resolve) => setTimeout(resolve, 60_000));
          clearInterval(pingTimer);
          await redis.ping();
          const elapsed = Date.now() - windowStart;
          const [statsAfterRaw, memoryAfterRaw, cpuAfterRaw] = await Promise.all([
            redis.info("stats"), redis.info("memory"), redis.info("cpu"),
          ]);
          const statsAfter = parseInfo(statsAfterRaw);
          const memoryAfter = parseInfo(memoryAfterRaw);
          const cpuAfter = parseInfo(cpuAfterRaw);
          const mainCpuDelta = process.cpuUsage(mainCpu);
          const mainMemoryAfter = process.memoryUsage();
          const workerAfter = await sampleWorker();
          const intervals = receivedAt.flatMap((times) => {
            const recent = times.filter((time) => time >= windowStart);
            return recent.slice(1).map((time, i) => time - recent[i]!);
          });
          const counts = receivedAt.map((times) => times.filter((time) => time >= windowStart).length);
          const redisCpuMs = (
            Number(cpuAfter.used_cpu_user ?? 0) + Number(cpuAfter.used_cpu_sys ?? 0)
            - Number(cpuBefore.used_cpu_user ?? 0) - Number(cpuBefore.used_cpu_sys ?? 0)
          ) * 1000;
          const report = {
            minute, connectedPlayers: sockets.filter((socket) => socket.connected).length,
            minSnapshotsPerClient: Math.min(...counts),
            snapshotIntervalP50Ms: percentile(intervals, 0.5),
            snapshotIntervalP95Ms: percentile(intervals, 0.95),
            redisPingP50Ms: percentile(pings, 0.5), redisPingP95Ms: percentile(pings, 0.95),
            redisCpuCorePercent: Number((redisCpuMs / elapsed * 100).toFixed(2)),
            redisCommandsPerSecond: Math.round((Number(statsAfter.total_commands_processed ?? 0) - Number(statsBefore.total_commands_processed ?? 0)) / (elapsed / 1000)),
            redisMemoryUsedBytes: Number(memoryAfter.used_memory ?? 0),
            redisMemoryDeltaBytes: Number(memoryAfter.used_memory ?? 0) - Number(memoryBefore.used_memory ?? 0),
            redisNetworkInBytes: Number(statsAfter.total_net_input_bytes ?? 0) - Number(statsBefore.total_net_input_bytes ?? 0),
            redisNetworkOutBytes: Number(statsAfter.total_net_output_bytes ?? 0) - Number(statsBefore.total_net_output_bytes ?? 0),
            primaryNodeCpuCorePercent: Number(((mainCpuDelta.user + mainCpuDelta.system) / (elapsed * 1000) * 100).toFixed(2)),
            primaryNodeRssBytes: mainMemoryAfter.rss, primaryNodeRssDeltaBytes: mainMemoryAfter.rss - mainMemory.rss,
            primaryNodeHeapUsedBytes: mainMemoryAfter.heapUsed,
            secondaryGatewayCpuCorePercent: Number(((workerAfter.cpu.user - workerBefore.cpu.user + workerAfter.cpu.system - workerBefore.cpu.system) / (elapsed * 1000) * 100).toFixed(2)),
            secondaryGatewayRssBytes: workerAfter.memory.rss,
            secondaryGatewayRssDeltaBytes: workerAfter.memory.rss - workerBefore.memory.rss,
            secondaryGatewayHeapUsedBytes: workerAfter.memory.heapUsed,
            allClientsConnected: sockets.every((socket) => socket.connected),
          };
          reports.push(report);
          console.info("BW_REALTIME_SOAK_MINUTE", JSON.stringify(report));
          expect(report.connectedPlayers).toBe(100);
          expect(report.allClientsConnected).toBe(true);
          expect(report.minSnapshotsPerClient).toBeGreaterThan(300);
          expect(report.redisPingP95Ms).not.toBeNull();
          expect(report.snapshotIntervalP95Ms).not.toBeNull();
        }
      } finally {
        clearInterval(emitTimer);
        sockets.forEach((socket) => socket.disconnect());
      }
      console.info("BW_REALTIME_SOAK_RESULT", JSON.stringify({
        players: 100, gatewayProcesses: 2, minutes: 30, tickRateHz: TICK_RATE_HZ,
        durationMs: Date.now() - started, minuteReports: reports,
      }));
    },
    1_900_000,
  );


  it("rejects remote checkpoint saves even when the requested spawn exists", async () => {
    const created = await register(randomUUID());
    const before = await pool.query("SELECT spawn_id FROM player_locations WHERE user_id = $1", [created.body.user.id]);
    const response = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(response.status).toBe(409);
    const after = await pool.query("SELECT spawn_id FROM player_locations WHERE user_id = $1", [created.body.user.id]);
    expect(after.rows[0].spawn_id).toBe(before.rows[0].spawn_id);
  });

  it("rejects checkpoint writes from a socket whose ownership lease was replaced", async () => {
    const created = await register(randomUUID());
    const userId = created.body.user.id;
    await setPresence(userId, [-18, 1.2, 4]);
    await redis.set(`socket-owner:${userId}`, "replacement-socket", "PX", 60_000);

    const before = await pool.query("SELECT spawn_id FROM player_locations WHERE user_id = $1", [userId]);
    const response = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(response.status).toBe(409);
    const after = await pool.query("SELECT spawn_id FROM player_locations WHERE user_id = $1", [userId]);
    expect(after.rows[0].spawn_id).toBe(before.rows[0].spawn_id);
  });

  it("sends the authoritative NPC schedule snapshot to newly joined players", async () => {
    const created = await register(randomUUID());
    const { SOCKET_EVENTS: E } = await import("@bw/shared");
    const socket = createSocket(baseUrl, {
      auth: { token: created.body.accessToken }, transports: ["websocket"], reconnection: false,
    });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("connect_error", reject);
    });
    const snapshotPromise = new Promise<{ regionId: string; timeZone: string; npcs: Array<{ id: string; state: { id: string } | null }> }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for authoritative NPC snapshot")), 5_000);
      socket.once(E.serverNpcState, (snapshot) => { clearTimeout(timer); resolve(snapshot); });
    });
    const joined = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out joining NPC snapshot region")), 5_000);
      socket.once(E.serverJoined, () => { clearTimeout(timer); resolve(); });
    });
    socket.emit(E.clientJoin, { regionId: "temple_complex" });
    await joined;
    const snapshot = await snapshotPromise;
    expect(snapshot.regionId).toBe("temple_complex");
    expect(snapshot.timeZone).toBe("Asia/Ho_Chi_Minh");
    expect(snapshot.npcs.some((npc) => npc.id === "monk_guide" && npc.state !== null)).toBe(true);
    socket.disconnect();
  });

  it("supports friend requests, mutual blocking and friendship removal", async () => {
    const alice = await register(randomUUID());
    const bob = await register(randomUUID());
    const aliceHeaders = { authorization: `Bearer ${alice.body.accessToken}`, "content-type": "application/json" };
    const bobHeaders = { authorization: `Bearer ${bob.body.accessToken}`, "content-type": "application/json" };

    const sent = await request(`/api/social/friends/requests/${bob.body.user.id}`, { method: "POST", headers: aliceHeaders });
    expect(sent.status).toBe(201);
    const invite = await sent.json() as { id: string };
    const accepted = await request(`/api/social/friends/requests/${invite.id}/respond`, {
      method: "POST", headers: bobHeaders, body: JSON.stringify({ decision: "accept" }),
    });
    expect(accepted.status).toBe(200);
    const friends = await request("/api/social/friends", { headers: aliceHeaders });
    expect((await friends.json()).friends.map((friend: { id: string }) => friend.id)).toContain(bob.body.user.id);

    const blocked = await request(`/api/social/blocks/${bob.body.user.id}`, { method: "POST", headers: aliceHeaders });
    expect(blocked.status).toBe(204);
    const afterBlock = await request("/api/social/friends", { headers: aliceHeaders });
    expect((await afterBlock.json()).friends).toEqual([]);
    const denied = await request(`/api/social/friends/requests/${alice.body.user.id}`, { method: "POST", headers: bobHeaders });
    expect(denied.status).toBe(403);
  });

  it("prevents one player from joining two parties concurrently", async () => {
    const firstLeader = await register(randomUUID());
    const secondLeader = await register(randomUUID());
    const player = await register(randomUUID());
    const headers = (accessToken: string) => ({
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    });

    const firstCreated = await request("/api/social/party", {
      method: "POST", headers: headers(firstLeader.body.accessToken),
      body: JSON.stringify({ regionId: "temple_complex" }),
    });
    const secondCreated = await request("/api/social/party", {
      method: "POST", headers: headers(secondLeader.body.accessToken),
      body: JSON.stringify({ regionId: "temple_complex" }),
    });
    expect(firstCreated.status).toBe(201);
    expect(secondCreated.status).toBe(201);
    const firstPartyId = (await firstCreated.json()).partyId as string;
    const secondPartyId = (await secondCreated.json()).partyId as string;

    const [firstJoin, secondJoin] = await Promise.all([
      request(`/api/social/party/${firstPartyId}/join`, {
        method: "POST", headers: headers(player.body.accessToken),
      }),
      request(`/api/social/party/${secondPartyId}/join`, {
        method: "POST", headers: headers(player.body.accessToken),
      }),
    ]);

    expect([firstJoin.status, secondJoin.status].sort()).toEqual([204, 409]);
    const activeMemberships = await pool.query<{ party_id: string; role: string }>(
      "SELECT party_id, role FROM party_members WHERE user_id=$1 AND left_at IS NULL",
      [player.body.user.id],
    );
    expect(activeMemberships.rows).toHaveLength(1);
    expect([firstPartyId, secondPartyId]).toContain(activeMemberships.rows[0].party_id);
    expect(activeMemberships.rows[0].role).toBe("member");
  });

  it("restricts party member removal to the leader and revokes access", async () => {
    const leader = await register(randomUUID());
    const member = await register(randomUUID());
    const outsider = await register(randomUUID());
    const headers = (accessToken: string) => ({
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    });
    const created = await request("/api/social/party", {
      method: "POST", headers: headers(leader.body.accessToken),
      body: JSON.stringify({ regionId: "temple_complex" }),
    });
    expect(created.status).toBe(201);
    const partyId = (await created.json()).partyId as string;
    const joined = await request(`/api/social/party/${partyId}/join`, {
      method: "POST", headers: headers(member.body.accessToken),
    });
    expect(joined.status).toBe(204);

    const denied = await request(`/api/social/party/${partyId}/members/${member.body.user.id}/kick`, {
      method: "POST", headers: headers(outsider.body.accessToken),
    });
    expect(denied.status).toBe(403);

    const removed = await request(`/api/social/party/${partyId}/members/${member.body.user.id}/kick`, {
      method: "POST", headers: headers(leader.body.accessToken),
    });
    expect(removed.status).toBe(204);
    const membership = await pool.query<{ left_at: Date | null }>(
      "SELECT left_at FROM party_members WHERE party_id=$1 AND user_id=$2",
      [partyId, member.body.user.id],
    );
    expect(membership.rows).toHaveLength(1);
    expect(membership.rows[0].left_at).not.toBeNull();

    const revoked = await request(`/api/social/party/${partyId}/messages`, {
      headers: headers(member.body.accessToken),
    });
    expect(revoked.status).toBe(403);
  });

  it("serializes party membership, leader handoff and member-only chat", async () => {
    const leader = await register(randomUUID());
    const member = await register(randomUUID());
    const leaderHeaders = { authorization: `Bearer ${leader.body.accessToken}`, "content-type": "application/json" };
    const memberHeaders = { authorization: `Bearer ${member.body.accessToken}`, "content-type": "application/json" };

    const created = await request("/api/social/party", {
      method: "POST", headers: leaderHeaders, body: JSON.stringify({ regionId: "temple_complex" }),
    });
    expect(created.status).toBe(201);
    const partyId = (await created.json()).partyId as string;
    const joined = await request(`/api/social/party/${partyId}/join`, { method: "POST", headers: memberHeaders });
    expect(joined.status).toBe(204);

    const sent = await request(`/api/social/party/${partyId}/messages`, {
      method: "POST", headers: memberHeaders, body: JSON.stringify({ text: "Nam mô." }),
    });
    expect(sent.status).toBe(201);
    const denied = await request(`/api/social/party/${partyId}/messages`, {
      headers: { authorization: `Bearer ${(await register(randomUUID())).body.accessToken}` },
    });
    expect(denied.status).toBe(403);

    const leftLeader = await request("/api/social/party/leave", { method: "POST", headers: leaderHeaders });
    expect(leftLeader.status).toBe(204);
    const memberParty = await request("/api/social/party", { headers: memberHeaders });
    expect((await memberParty.json()).party).toMatchObject({ id: partyId, role: "leader" });
    const leftLastMember = await request("/api/social/party/leave", { method: "POST", headers: memberHeaders });
    expect(leftLastMember.status).toBe(204);
    const closed = await pool.query("SELECT status FROM parties WHERE id = $1", [partyId]);
    expect(closed.rows[0]?.status).toBe("closed");
  });

  it("publishes community events and processes moderation reports with an audit trail", async () => {
    const host = await register(randomUUID());
    const attendee = await register(randomUUID());
    const moderator = await register(randomUUID());
    await pool.query("UPDATE users SET role = 'moderator' WHERE id = $1", [moderator.body.user.id]);
    const hostHeaders = { authorization: `Bearer ${host.body.accessToken}`, "content-type": "application/json" };
    const attendeeHeaders = { authorization: `Bearer ${attendee.body.accessToken}`, "content-type": "application/json" };
    const moderatorHeaders = { authorization: `Bearer ${moderator.body.accessToken}`, "content-type": "application/json" };

    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const deniedCreate = await request("/api/social/events", {
      method: "POST", headers: hostHeaders,
      body: JSON.stringify({ title: "Buổi thiền", description: "Thử nghiệm", regionId: "temple_complex", startsAt: start, endsAt: end, capacity: 8 }),
    });
    expect(deniedCreate.status).toBe(403);
    const created = await request("/api/social/events", {
      method: "POST", headers: moderatorHeaders,
      body: JSON.stringify({ title: "Buổi thiền cộng đồng", description: "Sinh hoạt an lành", regionId: "temple_complex", startsAt: start, endsAt: end, capacity: 8 }),
    });
    expect(created.status).toBe(201);
    const eventId = (await created.json()).id as string;
    const joined = await request(`/api/social/events/${eventId}/join`, { method: "POST", headers: attendeeHeaders });
    expect(joined.status).toBe(201);

    const report = await request("/api/social/reports", {
      method: "POST", headers: attendeeHeaders,
      body: JSON.stringify({ targetType: "user", targetId: host.body.user.id, targetUserId: host.body.user.id, reason: "Hành vi không phù hợp", details: "Báo cáo kiểm thử." }),
    });
    expect(report.status).toBe(201);
    const reportId = (await report.json()).id as string;
    const queue = await request("/api/social/moderation/reports", { headers: moderatorHeaders });
    expect((await queue.json()).reports.some((item: { id: string }) => item.id === reportId)).toBe(true);
    const resolved = await request(`/api/social/moderation/reports/${reportId}`, {
      method: "PATCH", headers: moderatorHeaders,
      body: JSON.stringify({ status: "resolved", resolution: "Đã xem xét." }),
    });
    expect(resolved.status).toBe(200);
    const history = await pool.query("SELECT action FROM moderation_report_events WHERE report_id = $1 ORDER BY id", [reportId]);
    expect(history.rows.map((row: { action: string }) => row.action)).toEqual(["created", "resolved"]);
  });

  it("resolves moderation report targets from authoritative rows for user, party, event and message", async () => {
    const reporter = await register(randomUUID());
    const secondReporter = await register(randomUUID());
    const userTarget = await register(randomUUID());
    const eventHost = await register(randomUUID());
    const partyLeader = await register(randomUUID());
    const messageSender = await register(randomUUID());
    const moderator = await register(randomUUID());
    await pool.query("UPDATE users SET role = 'moderator' WHERE id = $1", [moderator.body.user.id]);
    const reporterHeaders = { authorization: `Bearer ${reporter.body.accessToken}`, "content-type": "application/json" };
    const moderatorHeaders = { authorization: `Bearer ${moderator.body.accessToken}`, "content-type": "application/json" };

    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const eventResponse = await request("/api/social/events", {
      method: "POST", headers: moderatorHeaders,
      body: JSON.stringify({ title: "Target resolution event", regionId: "temple_complex", startsAt: start, endsAt: end, capacity: 8 }),
    });
    expect(eventResponse.status).toBe(201);
    const eventId = (await eventResponse.json()).id as string;

    const partyResponse = await request("/api/social/party", {
      method: "POST",
      headers: { authorization: `Bearer ${partyLeader.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex" }),
    });
    expect(partyResponse.status).toBe(201);
    const partyId = (await partyResponse.json()).partyId as string;
    const joinedParty = await request(`/api/social/party/${partyId}/join`, {
      method: "POST", headers: { authorization: `Bearer ${messageSender.body.accessToken}` },
    });
    expect(joinedParty.status).toBe(204);
    const messageResponse = await request(`/api/social/party/${partyId}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${messageSender.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ text: "Message reported by integration test" }),
    });
    expect(messageResponse.status).toBe(201);
    const messageId = String((await messageResponse.json()).id);

    const targets = [
      { targetType: "user", targetId: userTarget.body.user.id, expectedUserId: userTarget.body.user.id },
      { targetType: "party", targetId: partyId, expectedUserId: partyLeader.body.user.id },
      { targetType: "event", targetId: eventId, expectedUserId: moderator.body.user.id },
      { targetType: "message", targetId: messageId, expectedUserId: messageSender.body.user.id },
    ] as const;
    for (const target of targets) {
      const response = await request("/api/social/reports", {
        method: "POST", headers: reporterHeaders,
        // A conflicting client hint must never override the owner resolved from the target row.
        body: JSON.stringify({
          targetType: target.targetType, targetId: target.targetId,
          targetUserId: reporter.body.user.id, reason: `Report ${target.targetType}`,
        }),
      });
      expect(response.status).toBe(201);
      const reportId = (await response.json()).id as string;
      const stored = await pool.query(
        "SELECT target_user_id,target_type,target_id FROM moderation_reports WHERE id=$1", [reportId],
      );
      expect(stored.rows[0]).toMatchObject({
        target_user_id: target.expectedUserId, target_type: target.targetType, target_id: target.targetId,
      });
    }

    const selfReport = await request("/api/social/reports", {
      method: "POST", headers: reporterHeaders,
      body: JSON.stringify({ targetType: "user", targetId: reporter.body.user.id, reason: "Self report must fail" }),
    });
    expect(selfReport.status).toBe(400);
    const missingTarget = await request("/api/social/reports", {
      method: "POST", headers: { authorization: `Bearer ${secondReporter.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ targetType: "event", targetId: randomUUID(), reason: "Missing event" }),
    });
    expect(missingTarget.status).toBe(404);
  });

  it("returns event membership state and enforces capacity under concurrent joins", async () => {
    const moderator = await register(randomUUID());
    const first = await register(randomUUID());
    const second = await register(randomUUID());
    const third = await register(randomUUID());
    await pool.query("UPDATE users SET role = 'moderator' WHERE id = $1", [moderator.body.user.id]);
    const moderatorHeaders = { authorization: `Bearer ${moderator.body.accessToken}`, "content-type": "application/json" };
    const start = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const created = await request("/api/social/events", {
      method: "POST", headers: moderatorHeaders,
      body: JSON.stringify({ title: "Capacity race", regionId: "temple_complex", startsAt: start, endsAt: end, capacity: 2 }),
    });
    expect(created.status).toBe(201);
    const eventId = (await created.json()).id as string;
    const join = (user: typeof first) => request(`/api/social/events/${eventId}/join`, {
      method: "POST", headers: { authorization: `Bearer ${user.body.accessToken}` },
    });
    const simultaneous = await Promise.all([join(first), join(second), join(third)]);
    expect(simultaneous.filter((response) => response.status === 201)).toHaveLength(2);
    expect(simultaneous.filter((response) => response.status === 409)).toHaveLength(1);

    const eventStates = await Promise.all([first, second, third].map(async (user) => {
      const response = await request("/api/social/events", {
        headers: { authorization: `Bearer ${user.body.accessToken}` },
      });
      const event = (await response.json() as { events: Array<{ id: string; joined: boolean; participant_count: number; capacity: number }> })
        .events.find((entry) => entry.id === eventId);
      return { user, event };
    }));
    expect(eventStates.filter(({ event }) => event?.joined)).toHaveLength(2);
    expect(eventStates.filter(({ event }) => !event?.joined)).toHaveLength(1);
    expect(eventStates[0]?.event).toMatchObject({ participant_count: 2, capacity: 2 });
    const existingMember = eventStates.find(({ event }) => event?.joined)?.user ?? first;
    const duplicate = await join(existingMember);
    expect(duplicate.status).toBe(409);
  });

  it("authorizes world content editing from the current database role and audits changes", async () => {
    const created = await register(randomUUID());
    const headers = { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" };

    const denied = await request("/api/admin/world/content", { headers });
    expect(denied.status).toBe(403);

    // The authorization decision must use the current DB role, not the role claim
    // embedded in the access token issued before this promotion.
    await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [created.body.user.id]);
    const catalog = await request("/api/admin/world/content", { headers });
    expect(catalog.status).toBe(200);
    const catalogBody = await catalog.json() as {
      npcs: unknown[]; quests: unknown[]; items: unknown[]; achievements: unknown[];
    };
    expect(catalogBody.npcs.length).toBeGreaterThan(0);
    expect(catalogBody.quests.length).toBeGreaterThan(0);
    expect(catalogBody.items.length).toBeGreaterThan(0);
    expect(catalogBody.achievements.length).toBeGreaterThan(0);

    const invalidQuest = await request("/api/admin/world/quests/first_greeting", {
      method: "PUT", headers,
      body: JSON.stringify({
        npcId: "monk_guide", title: "Lời chào đầu tiên", description: "Kiểm tra",
        objectives: [{ type: "interact", targetId: "monk_guide", count: 0 }],
        rewards: [{ itemId: "lotus_token", quantity: 1 }],
        isRepeatable: false, isActive: true,
      }),
    });
    expect(invalidQuest.status).toBe(400);

    const updatedNpc = await request("/api/admin/world/npcs/monk_guide", {
      method: "PUT", headers,
      body: JSON.stringify({ name: "Chú tiểu hướng dẫn", title: "Người hướng dẫn tham quan", isActive: true }),
    });
    expect(updatedNpc.status).toBe(200);
    const audit = await pool.query(
      "SELECT action, detail FROM audit_logs WHERE user_id = $1 AND action = 'world_content_updated' ORDER BY id DESC LIMIT 1",
      [created.body.user.id],
    );
    expect(audit.rows[0]?.detail).toMatchObject({ entityType: "npc", entityId: "monk_guide" });
  });

  it("requires proximity to the active scheduled NPC position before accepting an NPC-linked quest", async () => {
    const created = await register(randomUUID());
    const headers = { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" };
    const remote = await request("/api/world/quests/first_greeting/accept", { method: "POST", headers });
    expect(remote.status).toBe(409);

    const snapshot = await request("/api/world/npcs?regionId=temple_complex", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect(snapshot.status).toBe(200);
    const snapshotBody = await snapshot.json() as {
      npcs: Array<{ id: string; state: { position: [number, number, number]; regionId: string } | null }>;
    };
    const entry = snapshotBody.npcs.find((npc) => npc.id === "monk_guide")?.state;
    expect(entry).toBeTruthy();
    await setPresence(created.body.user.id, entry!.position, entry!.regionId);
    const unlock = await request("/api/world/npcs/monk_guide/dialogue/choice", {
      method: "POST", headers, body: JSON.stringify({ nodeId: "welcome", choiceId: "ask_tour" }),
    });
    expect(unlock.status).toBe(200);
    const nearby = await request("/api/world/quests/first_greeting/accept", { method: "POST", headers });
    expect(nearby.status).toBe(201);
    expect(await nearby.json()).toMatchObject({ questId: "first_greeting", status: "active" });
  });

  it("serializes concurrent quest acceptance for a player even before a player_quests row exists", async () => {
    const created = await register(randomUUID());
    const headers = { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" };
    const snapshot = await request("/api/world/npcs?regionId=temple_complex", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    const snapshotBody = await snapshot.json() as {
      npcs: Array<{ id: string; state: { position: [number, number, number]; regionId: string } | null }>;
    };
    const entry = snapshotBody.npcs.find((npc) => npc.id === "monk_guide")?.state;
    expect(entry).toBeTruthy();
    await setPresence(created.body.user.id, entry!.position, entry!.regionId);
    const unlock = await request("/api/world/npcs/monk_guide/dialogue/choice", {
      method: "POST", headers, body: JSON.stringify({ nodeId: "welcome", choiceId: "ask_tour" }),
    });
    expect(unlock.status).toBe(200);

    const accept = () => request("/api/world/quests/first_greeting/accept", { method: "POST", headers });
    const results = await Promise.all([accept(), accept()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const persisted = await pool.query(
      "SELECT status FROM player_quests WHERE user_id = $1 AND quest_id = 'first_greeting'",
      [created.body.user.id],
    );
    expect(persisted.rows).toEqual([{ status: "active" }]);
  });

  it("rejects gameplay mutations fenced by a newer persisted socket epoch", async () => {
    const created = await register(randomUUID());
    const userId = created.body.user.id;
    const headers = { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" };
    const { getWorldInteraction } = await import("@bw/shared");
    const target = getWorldInteraction("incense_burner");
    expect(target).toBeTruthy();
    await setPresence(userId, target!.position, target!.regionId);
    await pool.query(
      "INSERT INTO player_inventory (user_id, item_id, quantity) VALUES ($1, 'incense_bundle', 1)",
      [userId],
    );
    const epoch = Number(await redis.get(`socket-owner-epoch:${userId}`));
    await pool.query("UPDATE player_locations SET owner_epoch = $2 WHERE user_id = $1", [userId, epoch + 1]);
    await pool.query(
      "UPDATE socket_owner_authority SET owner_token = $2, owner_epoch = $3, updated_at = now() WHERE user_id = $1",
      [userId, randomUUID(), epoch + 1],
    );

    const response = await request("/api/world/inventory/incense_bundle/use", { method: "POST", headers });
    expect(response.status).toBe(409);
    const remaining = await pool.query(
      "SELECT quantity FROM player_inventory WHERE user_id = $1 AND item_id = 'incense_bundle'",
      [userId],
    );
    expect(remaining.rows).toEqual([{ quantity: 1 }]);
  });

  it("serializes durable owner takeover behind an in-flight mutation transaction", async () => {
    const created = await register(randomUUID());
    const userId = created.body.user.id;
    const { getWorldInteraction } = await import("@bw/shared");
    const target = getWorldInteraction("temple_bell");
    await setPresence(userId, target!.position, target!.regionId);
    const { getOwnedPresenceSnapshot } = await import("../modules/me/presence.js");
    const ownership = await getOwnedPresenceSnapshot(userId);
    expect(ownership).toBeTruthy();

    const oldMutation = await pool.connect();
    await oldMutation.query("BEGIN");
    const { lockSocketOwnership, claimSocketOwnership } = await import("../modules/me/socketOwnership.js");
    expect(await lockSocketOwnership(oldMutation, userId, ownership!)).toBe(true);

    let takeoverResolved = false;
    const takeover = claimSocketOwnership(userId, randomUUID(), ownership!.ownerEpoch)
      .then((epoch) => { takeoverResolved = true; return epoch; });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(takeoverResolved).toBe(false);

    await oldMutation.query("COMMIT");
    oldMutation.release();
    const newEpoch = await takeover;
    expect(newEpoch).toBeGreaterThan(ownership!.ownerEpoch);

    const staleMutation = await pool.connect();
    try {
      await staleMutation.query("BEGIN");
      expect(await lockSocketOwnership(staleMutation, userId, ownership!)).toBe(false);
      await staleMutation.query("ROLLBACK");
    } finally { staleMutation.release(); }
  });

  it("consumes a single inventory item exactly once under concurrent use requests", async () => {
    const created = await register(randomUUID());
    const userId = created.body.user.id;
    const headers = { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" };
    const { getWorldInteraction } = await import("@bw/shared");
    const target = getWorldInteraction("incense_burner");
    expect(target).toBeTruthy();
    await setPresence(userId, target!.position, target!.regionId);
    await pool.query(
      "INSERT INTO player_inventory (user_id, item_id, quantity) VALUES ($1, 'incense_bundle', 1)",
      [userId],
    );

    const use = () => request("/api/world/inventory/incense_bundle/use", { method: "POST", headers });
    const results = await Promise.all([use(), use()]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const remaining = await pool.query(
      "SELECT quantity FROM player_inventory WHERE user_id = $1 AND item_id = 'incense_bundle'",
      [userId],
    );
    expect(remaining.rows).toEqual([]);
  });

  it("persists branching NPC choices and unlocks only branch-authorized quests", async () => {
    const created = await register(randomUUID());
    const headers = { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" };
    const snapshot = await request("/api/world/npcs?regionId=temple_complex", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect(snapshot.status).toBe(200);
    const snapshotBody = await snapshot.json() as {
      npcs: Array<{ id: string; state: { position: [number, number, number]; regionId: string } | null }>;
    };
    const entry = snapshotBody.npcs.find((npc) => npc.id === "monk_guide")?.state;
    expect(entry).toBeTruthy();
    await setPresence(created.body.user.id, entry!.position, entry!.regionId);
    const lockedQuest = await request("/api/world/quests/first_greeting/accept", { method: "POST", headers });
    expect(lockedQuest.status).toBe(403);

    const selected = await request("/api/world/npcs/monk_guide/dialogue/choice", {
      method: "POST", headers, body: JSON.stringify({ nodeId: "welcome", choiceId: "ask_tour" }),
    });
    expect(selected.status).toBe(200);
    const result = await selected.json() as { node: { id: string; choices: unknown[] }; flags: Record<string, boolean>; unlockedQuestIds: string[]; questOffers: Array<{ id: string }> };
    expect(result.node.id).toBe("tour");
    expect(result.flags.askedTour).toBe(true);
    expect(result.unlockedQuestIds).toContain("first_greeting");
    expect(result.questOffers.map((quest) => quest.id)).toContain("first_greeting");

    const persisted = await pool.query<{ current_node_id: string; flags: Record<string, boolean>; choice_history: unknown[] }>(
      "SELECT current_node_id, flags, choice_history FROM player_npc_dialogue_state WHERE user_id = $1 AND npc_id = 'monk_guide'",
      [created.body.user.id],
    );
    expect(persisted.rows[0]?.current_node_id).toBe("tour");
    expect(persisted.rows[0]?.flags.askedTour).toBe(true);
    expect(persisted.rows[0]?.choice_history).toHaveLength(1);

    const staleChoice = await request("/api/world/npcs/monk_guide/dialogue/choice", {
      method: "POST", headers, body: JSON.stringify({ nodeId: "welcome", choiceId: "ask_practice" }),
    });
    expect(staleChoice.status).toBe(409);
  });

  it("fails closed for an invalid checkpoint without modifying the saved location", async () => {
    const created = await register(randomUUID());
    const before = await pool.query("SELECT spawn_id FROM player_locations WHERE user_id = $1", [created.body.user.id]);
    const response = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "not-a-real-place" }),
    });
    expect(response.status).toBe(400);
    const after = await pool.query("SELECT spawn_id FROM player_locations WHERE user_id = $1", [created.body.user.id]);
    expect(after.rows[0].spawn_id).toBe(before.rows[0].spawn_id);
  });

  it("rolls back quest completion when the full reward cannot fit, then grants it after space is freed", async () => {
    const created = await register(randomUUID());
    const userId = created.body.user.id;
    await pool.query(
      `INSERT INTO player_quests (user_id, quest_id, status, progress)
       VALUES ($1, 'quiet_temple', 'active', '{}'::jsonb)`,
      [userId],
    );
    const { recordWorldInteractionProgress } = await import("../modules/world/progress.js");
    const interaction = (await import("@bw/shared")).getWorldInteraction("temple_bell");
    await setPresence(userId, interaction!.position, interaction!.regionId);
    const { getOwnedPresenceSnapshot } = await import("../modules/me/presence.js");
    const ownership = await getOwnedPresenceSnapshot(userId);
    expect(ownership).toBeTruthy();
    await recordWorldInteractionProgress(userId, "temple_bell", ownership!);
    await pool.query(
      `INSERT INTO player_inventory (user_id, item_id, quantity)
       VALUES ($1, 'incense_bundle', 19)`,
      [userId],
    );

    await expect(recordWorldInteractionProgress(userId, "incense_burner", ownership!))
      .rejects.toMatchObject({ code: "quest_reward_inventory_full" });

    const rolledBackQuest = await pool.query(
      "SELECT status, progress, completed_at FROM player_quests WHERE user_id = $1 AND quest_id = 'quiet_temple'",
      [userId],
    );
    expect(rolledBackQuest.rows[0].status).toBe("active");
    expect(rolledBackQuest.rows[0].progress).toMatchObject({ temple_bell: 1 });
    expect(rolledBackQuest.rows[0].progress).not.toHaveProperty("incense_burner");
    expect(rolledBackQuest.rows[0].completed_at).toBeNull();

    const rolledBackInventory = await pool.query(
      "SELECT item_id, quantity FROM player_inventory WHERE user_id = $1 ORDER BY item_id",
      [userId],
    );
    expect(rolledBackInventory.rows).toEqual([{ item_id: "incense_bundle", quantity: 19 }]);

    await pool.query(
      "UPDATE player_inventory SET quantity = 18 WHERE user_id = $1 AND item_id = 'incense_bundle'",
      [userId],
    );
    const completed = await recordWorldInteractionProgress(userId, "incense_burner", ownership!);
    expect(completed).toMatchObject([{ questId: "quiet_temple", completed: true }]);

    const grantedInventory = await pool.query(
      "SELECT item_id, quantity FROM player_inventory WHERE user_id = $1 ORDER BY item_id",
      [userId],
    );
    expect(grantedInventory.rows).toEqual([
      { item_id: "incense_bundle", quantity: 20 },
      { item_id: "temple_badge", quantity: 1 },
    ]);
  });

  it("unlocks exploration achievements from durable server-recorded interactions exactly once", async () => {
    const created = await register(randomUUID());
    const userId = created.body.user.id;
    const interactions = [
      ["monk_guide", "npc"],
      ["temple_bell", "bell"],
      ["incense_burner", "incense"],
      ["buddha_statue", "buddha"],
      ["main_altar", "altar"],
    ] as const;
    for (const [targetId, kind] of interactions) {
      await pool.query(
        `INSERT INTO world_events (region_id, actor_user_id, actor_name, target_id, interaction_kind)
         VALUES ('temple_complex', $1, 'Achievement Tester', $2, $3)`,
        [userId, targetId, kind],
      );
    }

    const { recordWorldAchievements } = await import("../modules/world/achievements.js");
    const interaction = (await import("@bw/shared")).getWorldInteraction("temple_bell");
    await setPresence(userId, interaction!.position, interaction!.regionId);
    const { getOwnedPresenceSnapshot } = await import("../modules/me/presence.js");
    const ownership = await getOwnedPresenceSnapshot(userId);
    expect(ownership).toBeTruthy();
    const unlocked = await recordWorldAchievements(userId, ownership!);
    expect(unlocked.map((achievement) => achievement.id)).toEqual([
      "bell_ringer", "first_conversation", "quiet_mind", "temple_explorer",
    ]);
    await expect(recordWorldAchievements(userId, ownership!)).resolves.toEqual([]);

    const response = await request("/api/world/achievements", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { achievements: Array<{ id: string; progress: number; target_count: number; unlocked_at: string | null }> };
    const explorer = body.achievements.find((achievement) => achievement.id === "temple_explorer");
    expect(explorer).toMatchObject({ progress: 4, target_count: 4 });
    expect(explorer?.unlocked_at).toBeTruthy();
  });
  it("allows only the requester to cancel a pending friend request and either friend to remove the friendship", async () => {
    const first = await register(randomUUID());
    const second = await register(randomUUID());
    const firstHeaders = { authorization: `Bearer ${first.body.accessToken}` };
    const secondHeaders = { authorization: `Bearer ${second.body.accessToken}` };

    const created = await request(`/api/social/friends/requests/${second.body.user.id}`, {
      method: "POST",
      headers: firstHeaders,
    });
    expect(created.status).toBe(201);
    const requestBody = await created.json() as { id: string; status: string };
    expect(requestBody.status).toBe("pending");

    const forbiddenCancel = await request(`/api/social/friends/requests/${requestBody.id}`, {
      method: "DELETE",
      headers: secondHeaders,
    });
    expect(forbiddenCancel.status).toBe(404);

    const cancelled = await request(`/api/social/friends/requests/${requestBody.id}`, {
      method: "DELETE",
      headers: firstHeaders,
    });
    expect(cancelled.status).toBe(204);
    const cancelledRow = await pool.query(
      "SELECT status FROM friend_requests WHERE id=$1",
      [requestBody.id],
    );
    expect(cancelledRow.rows).toEqual([{ status: "cancelled" }]);

    const secondRequest = await request(`/api/social/friends/requests/${second.body.user.id}`, {
      method: "POST",
      headers: firstHeaders,
    });
    expect(secondRequest.status).toBe(201);
    const secondRequestBody = await secondRequest.json() as { id: string };
    const accepted = await request(`/api/social/friends/requests/${secondRequestBody.id}/respond`, {
      method: "POST",
      headers: { ...secondHeaders, "content-type": "application/json" },
      body: JSON.stringify({ decision: "accept" }),
    });
    expect(accepted.status).toBe(200);

    const removed = await request(`/api/social/friends/${second.body.user.id}`, {
      method: "DELETE",
      headers: firstHeaders,
    });
    expect(removed.status).toBe(204);
    const friendship = await pool.query(
      "SELECT 1 FROM friendships WHERE user_low_id < user_high_id AND user_low_id=$1 AND user_high_id=$2",
      [first.body.user.id < second.body.user.id ? first.body.user.id : second.body.user.id,
       first.body.user.id < second.body.user.id ? second.body.user.id : first.body.user.id],
    );
    expect(friendship.rows).toEqual([]);
  });

  it("allows an event participant to cancel registration without changing the event", async () => {
    const moderator = await register(randomUUID());
    const player = await register(randomUUID());
    await pool.query("UPDATE users SET role='admin' WHERE id=$1", [moderator.body.user.id]);
    const startsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const endsAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const created = await request("/api/social/events", {
      method: "POST",
      headers: { authorization: `Bearer ${moderator.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        title: "Integration event",
        description: "Temporary integration fixture",
        regionId: "temple_complex",
        startsAt,
        endsAt,
        capacity: 8,
      }),
    });
    expect(created.status).toBe(201);
    const event = await created.json() as { id: string };

    const playerHeaders = { authorization: `Bearer ${player.body.accessToken}` };
    const joined = await request(`/api/social/events/${event.id}/join`, {
      method: "POST",
      headers: playerHeaders,
    });
    expect(joined.status).toBe(201);

    const left = await request(`/api/social/events/${event.id}/leave`, {
      method: "DELETE",
      headers: playerHeaders,
    });
    expect(left.status).toBe(204);
    const membership = await pool.query(
      "SELECT 1 FROM community_event_members WHERE event_id=$1 AND user_id=$2",
      [event.id, player.body.user.id],
    );
    expect(membership.rows).toEqual([]);

    const eventStillExists = await pool.query(
      "SELECT status FROM community_events WHERE id=$1",
      [event.id],
    );
    expect(eventStillExists.rows).toEqual([{ status: "published" }]);
  });


  it("serializes concurrent friend-request cancellation against acceptance", async () => {
    const requester = await register(randomUUID());
    const recipient = await register(randomUUID());
    const requesterHeaders = { authorization: `Bearer ${requester.body.accessToken}` };
    const recipientHeaders = {
      authorization: `Bearer ${recipient.body.accessToken}`,
      "content-type": "application/json",
    };

    const created = await request(`/api/social/friends/requests/${recipient.body.user.id}`, {
      method: "POST",
      headers: requesterHeaders,
    });
    expect(created.status).toBe(201);
    const { id: requestId } = await created.json() as { id: string };

    const [cancelled, accepted] = await Promise.all([
      request(`/api/social/friends/requests/${requestId}`, {
        method: "DELETE",
        headers: requesterHeaders,
      }),
      request(`/api/social/friends/requests/${requestId}/respond`, {
        method: "POST",
        headers: recipientHeaders,
        body: JSON.stringify({ decision: "accept" }),
      }),
    ]);

    expect([cancelled.status, accepted.status].filter((status) => status === 204 || status === 200))
      .toHaveLength(1);
    expect([204, 404, 409]).toContain(cancelled.status);
    expect([200, 404, 409]).toContain(accepted.status);

    const persisted = await pool.query<{ status: string }>(
      "SELECT status FROM friend_requests WHERE id=$1",
      [requestId],
    );
    expect(persisted.rows).toHaveLength(1);
    const friendship = await pool.query(
      "SELECT 1 FROM friendships WHERE user_low_id=$1 AND user_high_id=$2",
      [
        requester.body.user.id < recipient.body.user.id ? requester.body.user.id : recipient.body.user.id,
        requester.body.user.id < recipient.body.user.id ? recipient.body.user.id : requester.body.user.id,
      ],
    );

    if (cancelled.status === 204) {
      expect(persisted.rows).toEqual([{ status: "cancelled" }]);
      expect(friendship.rows).toEqual([]);
      expect(accepted.status).not.toBe(200);
    } else {
      expect(accepted.status).toBe(200);
      expect(persisted.rows).toEqual([{ status: "accepted" }]);
      expect(friendship.rows).toHaveLength(1);
      expect(cancelled.status).not.toBe(204);
    }
  });

});
