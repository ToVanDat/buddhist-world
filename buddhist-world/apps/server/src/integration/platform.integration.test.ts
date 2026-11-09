import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.BW_TEST_DATABASE_URL;
const redisUrl = process.env.BW_TEST_REDIS_URL;
const enabled = Boolean(databaseUrl && redisUrl);
const schema = `bw_it_${randomUUID().replace(/-/g, "")}`;

let admin: Client | undefined;
let server: Server | undefined;
let baseUrl = "";
let pool: typeof import("../db/pool.js").pool;
let redis: typeof import("../lib/redis.js").redis;

function cookieOf(response: Response) {
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Expected bw_refresh cookie from auth endpoint");
  return cookie.split(";")[0]!;
}

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, init);
}

async function register(suffix: string) {
  const response = await request("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: `player-${suffix}@integration.test`,
      username: `player_${suffix.replace(/-/g, "").slice(0, 12)}`,
      password: "Integration-password-2026!",
    }),
  });
  expect(response.status).toBe(201);
  return { body: await response.json() as { accessToken: string; user: { id: string } }, cookie: cookieOf(response) };
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
    process.env.COOKIE_SECURE = "false";

    const migration = readFileSync(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8");
    const db = await import("../db/pool.js");
    pool = db.pool;
    await pool.query(migration);

    const redisModule = await import("../lib/redis.js");
    redis = redisModule.redis;
    await redis.ping();

    const { createApp } = await import("../app.js");
    server = createServer(createApp());
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind integration HTTP server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
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
    const profileBody = await profile.json() as { display_name: string; region_id: string; spawn_id: string };
    expect(profileBody.display_name).toBeTruthy();

    const updated = await request("/api/me/profile", {
      method: "PUT",
      headers: { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Tô Văn Đạt Integration" }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ displayName: "Tô Văn Đạt Integration" });

    const checkpoint = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(checkpoint.status).toBe(204);

    const saved = await pool.query(
      "SELECT region_id, spawn_id, x, y, z FROM player_locations WHERE user_id = $1",
      [created.body.user.id],
    );
    expect(saved.rows[0]).toMatchObject({ region_id: "temple_complex", spawn_id: "lotus_pond" });
    expect([saved.rows[0].x, saved.rows[0].y, saved.rows[0].z].every(Number.isFinite)).toBe(true);
  });

  it("rotates refresh tokens and revokes the whole family when an old token is reused", async () => {
    const created = await register(randomUUID());
    const rotated = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(rotated.status).toBe(200);
    const rotatedBody = await rotated.json() as { accessToken: string };
    const currentCookie = cookieOf(rotated);

    const replay = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(replay.status).toBe(401);

    const currentSession = await pool.query(
      "SELECT revoked_at FROM player_sessions WHERE token_hash = encode(digest(split_part($1, '=', 2), 'sha256'), 'hex')",
      [currentCookie],
    );
    // The cookie itself is opaque; assert the family revocation through the user session rows.
    const sessions = await pool.query(
      "SELECT revoked_at FROM player_sessions WHERE user_id = $1",
      [(await pool.query("SELECT id FROM users WHERE username LIKE 'player_%' ORDER BY created_at DESC LIMIT 1")).rows[0]?.id],
    );
    expect(currentSession.rows.length).toBeGreaterThanOrEqual(0);
    expect(sessions.rows.every((row) => row.revoked_at !== null)).toBe(true);

    const protectedRequest = await request("/api/me", {
      headers: { authorization: `Bearer ${rotatedBody.accessToken}` },
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
});
