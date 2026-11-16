import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../../db/pool.js", () => ({
  pool: { connect: mocks.connect },
}));
vi.mock("../../db/requireTables.js", () => ({
  requireTables: () => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
}));
vi.mock("../auth/requireAuth.js", () => ({
  requireAuth: (req: { auth?: { sub: string } }, _res: unknown, next: (error?: unknown) => void) => {
    req.auth = { sub: "test-admin" };
    next();
  },
}));
vi.mock("../auth/requirePermission.js", () => ({
  requirePermission: () => (_req: unknown, _res: unknown, next: (error?: unknown) => void) => next(),
}));

import { adminAssetsRouter } from "./routes.js";

describe("Asset Catalog publishing safety", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockReset();
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.startsWith("SELECT asset_key FROM world_asset_catalog")) {
        return { rows: [{ asset_key: "temple.gate" }] };
      }
      throw new Error(`Unexpected SQL in fail-closed approval test: ${sql}`);
    });
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });

    const app = express();
    app.use(express.json());
    app.use("/admin/assets", adminAssetsRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("does not approve an asset based on a client-controlled validation report", async () => {
    const response = await fetch(`${baseUrl}/admin/assets/00000000-0000-4000-8000-000000000001/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "ASSET_VALIDATOR_NOT_CONFIGURED" });
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).startsWith("UPDATE world_asset_catalog"))).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
