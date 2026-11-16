import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";

const databaseUrl = process.env.BW_TEST_DATABASE_URL;
const redisUrl = process.env.BW_TEST_REDIS_URL;
const enabled = Boolean(databaseUrl && redisUrl);
const schema = `bw_social_it_${randomUUID().replace(/-/g, "")}`;

let admin: Client | undefined;
let server: Server | undefined;
let baseUrl = "";
let pool: typeof import("../db/pool.js").pool;
let redis: typeof import("../lib/redis.js").redis;

async function request(path: string, token?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", "198.51.100.44");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

async function register() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
  const sourceIp = `10.${Number.parseInt(suffix.slice(0, 2), 16) % 250 + 1}.${Number.parseInt(suffix.slice(2, 4), 16) % 250 + 1}.${Number.parseInt(suffix.slice(4, 6), 16) % 250 + 1}`;
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": sourceIp },
    body: JSON.stringify({
      email: `social-${suffix}@integration.test`,
      username: `social_${suffix}`,
      password: "Integration-password-2026!",
    }),
  });
  expect(response.status).toBe(201);
  const body = await response.json() as { accessToken: string; user: { id: string } };
  return body;
}

describe.skipIf(!enabled)("PostgreSQL social relationship integration", () => {
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
    process.env.JWT_ACCESS_SECRET = "social-integration-test-secret-never-use-in-production";
    process.env.ACCESS_TOKEN_TTL_SEC = "900";
    process.env.REFRESH_TOKEN_TTL_SEC = "3600";
    process.env.COOKIE_SECURE = "false";

    const db = await import("../db/pool.js");
    pool = db.pool;
    const migrationDir = new URL("../db/migrations/", import.meta.url);
    for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
      await pool.query(readFileSync(new URL(file, migrationDir), "utf8"));
    }

    const redisModule = await import("../lib/redis.js");
    redis = redisModule.redis;
    await redis.ping();

    const { createApp } = await import("../app.js");
    server = createServer(createApp());
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind social integration HTTP server");
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

  it("isolates friend requests, supports reciprocal acceptance, remove, block and unblock", async () => {
    const alice = await register();
    const bob = await register();

    const anonymous = await request("/api/social/friends");
    expect(anonymous.status).toBe(401);

    const sent = await request("/api/social/requests", alice.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: bob.user.id }),
    });
    expect(sent.status).toBe(201);
    const sentBody = await sent.json() as { requestId: string; status: string };
    expect(sentBody.status).toBe("pending");

    const incoming = await request("/api/social/requests?direction=incoming", bob.accessToken);
    expect(incoming.status).toBe(200);
    const incomingBody = await incoming.json() as { requests: Array<{ id: string; user_id: string }> };
    expect(incomingBody.requests).toHaveLength(1);
    expect(incomingBody.requests[0]).toMatchObject({ id: sentBody.requestId, user_id: alice.user.id });

    // Only the intended recipient can accept an incoming request.
    const wrongOwner = await request(`/api/social/requests/${sentBody.requestId}/accept`, alice.accessToken, { method: "POST" });
    expect(wrongOwner.status).toBe(404);

    const accepted = await request(`/api/social/requests/${sentBody.requestId}/accept`, bob.accessToken, { method: "POST" });
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({ requestId: sentBody.requestId, status: "accepted" });

    const aliceFriends = await request("/api/social/friends", alice.accessToken);
    expect((await aliceFriends.json() as { friends: Array<{ id: string }> }).friends.map((friend) => friend.id)).toContain(bob.user.id);

    const removed = await request(`/api/social/friends/${bob.user.id}`, alice.accessToken, { method: "DELETE" });
    expect(removed.status).toBe(204);

    // A simultaneous/reciprocal invitation accepts the existing pending edge.
    const secondRequest = await request("/api/social/requests", alice.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: bob.user.id }),
    });
    expect(secondRequest.status).toBe(201);
    const reciprocal = await request("/api/social/requests", bob.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: alice.user.id }),
    });
    expect(reciprocal.status).toBe(200);
    expect(await reciprocal.json()).toMatchObject({ status: "accepted" });

    const blocked = await request(`/api/social/blocks/${bob.user.id}`, alice.accessToken, { method: "PUT" });
    expect(blocked.status).toBe(204);
    const friendsAfterBlock = await request("/api/social/friends", alice.accessToken);
    expect((await friendsAfterBlock.json() as { friends: unknown[] }).friends).toHaveLength(0);

    const blockList = await request("/api/social/blocks", alice.accessToken);
    expect((await blockList.json() as { blocks: Array<{ user_id: string }> }).blocks.map((item) => item.user_id)).toContain(bob.user.id);

    const blockedRequest = await request("/api/social/requests", bob.accessToken, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipientId: alice.user.id }),
    });
    expect(blockedRequest.status).toBe(403);

    const unblocked = await request(`/api/social/blocks/${bob.user.id}`, alice.accessToken, { method: "DELETE" });
    expect(unblocked.status).toBe(204);
    const history = await pool.query(
      "SELECT unblocked_at FROM player_blocks WHERE blocker_id = $1 AND blocked_id = $2 ORDER BY blocked_at DESC",
      [alice.user.id, bob.user.id],
    );
    expect(history.rows[0]?.unblocked_at).not.toBeNull();
  }, 20_000);
});
