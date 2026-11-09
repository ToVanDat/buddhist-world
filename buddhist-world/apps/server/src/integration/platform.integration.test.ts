import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { io as createSocket, type Socket as ClientSocket } from "socket.io-client";

const databaseUrl = process.env.BW_TEST_DATABASE_URL;
const redisUrl = process.env.BW_TEST_REDIS_URL;
const enabled = Boolean(databaseUrl && redisUrl);
const schema = `bw_it_${randomUUID().replace(/-/g, "")}`;

let admin: Client | undefined;
let server: Server | undefined;
let baseUrl = "";
let pool: typeof import("../db/pool.js").pool;
let redis: typeof import("../lib/redis.js").redis;
let gateway: { close: (callback?: (error?: Error) => void) => void } | undefined;
const clients: ClientSocket[] = [];

function cookieOf(response: Response) {
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Expected bw_refresh cookie from auth endpoint");
  return cookie.split(";")[0]!;
}

const testIp = Array.from({ length: 4 }, (_, index) =>
  1 + (Number.parseInt(schema.slice(6 + index * 2, 8 + index * 2), 16) % 254),
).join(".");

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", testIp);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
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
    const { attachGateway } = await import("../realtime/gateway.js");
    server = createServer(createApp());
    gateway = attachGateway(server);
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind integration HTTP server");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    for (const client of clients) client.disconnect();
    if (gateway) await new Promise<void>((resolve) => gateway!.close(() => resolve()));
    else if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
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
    expect((await login.json() as { accessToken: string }).accessToken).toBeTruthy();

    const updated = await request("/api/me/profile", {
      method: "PUT",
      headers: { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Tô Văn Đạt Integration" }),
    });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ displayName: "Tô Văn Đạt Integration" });
    const refreshedProfile = await request("/api/me", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect((await refreshedProfile.json() as { display_name: string }).display_name).toBe("Tô Văn Đạt Integration");

    const checkpoint = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(checkpoint.status).toBe(204);

    const saved = await pool.query(
      "SELECT region_id, spawn_id, x, y, z, yaw FROM player_locations WHERE user_id = $1",
      [created.body.user.id],
    );
    expect(saved.rows[0]).toMatchObject({ region_id: "temple_complex", spawn_id: "lotus_pond" });
    expect(saved.rows[0].yaw).toBeCloseTo(Math.PI / 2, 5);
    expect([saved.rows[0].x, saved.rows[0].y, saved.rows[0].z].every(Number.isFinite)).toBe(true);
  });

  it("rotates refresh tokens and revokes the whole family when an old token is reused", async () => {
    const created = await register(randomUUID());
    const rotated = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(rotated.status).toBe(200);
    const rotatedBody = await rotated.json() as { accessToken: string };

    const replay = await request("/api/auth/refresh", {
      method: "POST", headers: { cookie: created.cookie },
    });
    expect(replay.status).toBe(401);

    // The old-token replay must revoke the replacement session in the same family.
    const sessions = await pool.query(
      "SELECT revoked_at FROM player_sessions WHERE user_id = $1",
      [created.body.user.id],
    );
    expect(sessions.rows.length).toBe(2);
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

  it("reconnects players, replaces duplicate sockets and replicates remote animation state", async () => {
    const alice = await register(randomUUID());
    const bob = await register(randomUUID());
    const { SOCKET_EVENTS: E } = await import("@bw/shared");

    const connectPlayer = async (token: string) => {
      const socket = createSocket(baseUrl, {
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

    const checkpoint = await request("/api/me/checkpoint", {
      method: "PUT",
      headers: { authorization: `Bearer ${alice.body.accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ regionId: "temple_complex", spawnId: "lotus_pond" }),
    });
    expect(checkpoint.status).toBe(204);

    aliceSocket.disconnect();
    // Wait for the asynchronous disconnect handler to persist the last authoritative state.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const saved = await pool.query("SELECT z FROM player_locations WHERE user_id = $1", [alice.body.user.id]);
      if (typeof saved.rows[0]?.z === "number" && Math.abs(saved.rows[0].z - 19.7) < 0.01) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const reconnected = await connectPlayer(alice.body.accessToken);
    const restored = await joinPlayer(reconnected);
    expect(restored.regionId).toBe("temple_complex");
    expect(restored.position[2]).toBeCloseTo(19.7, 1);
    expect(restored.yaw).toBeCloseTo(Math.PI, 4);
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
