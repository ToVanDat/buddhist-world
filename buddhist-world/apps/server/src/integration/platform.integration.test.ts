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

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-forwarded-for", testIp);
  return fetch(`${baseUrl}${path}`, { ...init, headers });
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
  await redis.hset(
    `presence:${userId}`,
    "region", regionId,
    "x", String(position[0]),
    "y", String(position[1]),
    "z", String(position[2]),
    "heartbeatAt", String(Date.now()),
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

    await setPresence(created.body.user.id, [-18, 1.2, 4]);
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

    const replacement = await connectTo(alice.body.accessToken, secondBaseUrl);
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
    const winnerPresence = await redis.hgetall(presenceKey);
    expect(winnerLease).toBeTruthy();
    expect(winnerPresence.socketId).toBe(raceWinner.id);
    expect(winnerPresence.ownerToken).toBe(winnerLease);

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
    redis.disconnect();
    redisProbeSocket.emit(E.clientChat, { text: "must-not-be-accepted-during-redis-loss" });
    await redisDisconnected;
    redis.connect();
    await redis.ping();

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

  it("requires proximity to the assigned NPC before accepting an NPC-linked quest", async () => {
    const created = await register(randomUUID());
    const headers = { authorization: `Bearer ${created.body.accessToken}`, "content-type": "application/json" };
    const remote = await request("/api/world/quests/first_greeting/accept", { method: "POST", headers });
    expect(remote.status).toBe(409);

    await setPresence(created.body.user.id, [8, 1.2, -17]);
    const nearby = await request("/api/world/quests/first_greeting/accept", { method: "POST", headers });
    expect(nearby.status).toBe(201);
    expect(await nearby.json()).toMatchObject({ questId: "first_greeting", status: "active" });
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

    await recordWorldInteractionProgress(userId, "temple_bell");
    await pool.query(
      `INSERT INTO player_inventory (user_id, item_id, quantity)
       VALUES ($1, 'incense_bundle', 19)`,
      [userId],
    );

    await expect(recordWorldInteractionProgress(userId, "incense_burner"))
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
    const completed = await recordWorldInteractionProgress(userId, "incense_burner");
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
    const unlocked = await recordWorldAchievements(userId);
    expect(unlocked.map((achievement) => achievement.id)).toEqual([
      "bell_ringer", "first_conversation", "quiet_mind", "temple_explorer",
    ]);
    await expect(recordWorldAchievements(userId)).resolves.toEqual([]);

    const response = await request("/api/world/achievements", {
      headers: { authorization: `Bearer ${created.body.accessToken}` },
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { achievements: Array<{ id: string; progress: number; target_count: number; unlocked_at: string | null }> };
    const explorer = body.achievements.find((achievement) => achievement.id === "temple_explorer");
    expect(explorer).toMatchObject({ progress: 4, target_count: 4 });
    expect(explorer?.unlocked_at).toBeTruthy();
  });
});
