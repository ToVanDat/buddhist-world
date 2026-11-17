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

import { adminEconomyRouter } from "./admin.routes.js";

describe("Admin economy price transaction", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    mocks.query.mockReset();
    mocks.release.mockReset();
    mocks.connect.mockReset();
    mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT id FROM world_items")) return { rows: [{ id: values[0] }], rowCount: 1 };
      if (sql.startsWith("INSERT INTO world_item_prices")) {
        return {
          rows: [{
            item_id: values[0], currency_code: values[1], price: values[2],
            is_active: values[3], updated_at: "2026-11-16T00:00:00.000Z",
          }],
          rowCount: 1,
        };
      }
      if (sql.startsWith("INSERT INTO audit_logs")) return { rows: [], rowCount: 1 };
      throw new Error("Unexpected SQL in admin economy price test: " + sql);
    });
    mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });

    const app = express();
    app.use(express.json());
    app.use("/admin/economy", adminEconomyRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port.");
    baseUrl = "http://127.0.0.1:" + address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("commits the price change and its audit record in one transaction", async () => {
    const response = await fetch(baseUrl + "/admin/economy/prices/robe", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ price: 250, currencyCode: "BWG", isActive: true }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      price: { item_id: "robe", currency_code: "BWG", price: 250, is_active: true },
    });
    const sql = mocks.query.mock.calls.map(([statement]) => String(statement));
    expect(sql.indexOf("BEGIN")).toBeLessThan(sql.findIndex((statement) => statement.startsWith("INSERT INTO world_item_prices")));
    expect(sql.findIndex((statement) => statement.startsWith("INSERT INTO world_item_prices")))
      .toBeLessThan(sql.findIndex((statement) => statement.startsWith("INSERT INTO audit_logs")));
    expect(sql.findIndex((statement) => statement.startsWith("INSERT INTO audit_logs"))).toBeLessThan(sql.indexOf("COMMIT"));
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rolls back the price change when its audit record cannot be written", async () => {
    mocks.query.mockImplementation(async (sql: string, values: unknown[] = []) => {
      if (["BEGIN", "ROLLBACK"].includes(sql)) return { rows: [], rowCount: 0 };
      if (sql.startsWith("SELECT id FROM world_items")) return { rows: [{ id: values[0] }], rowCount: 1 };
      if (sql.startsWith("INSERT INTO world_item_prices")) {
        return { rows: [{ item_id: values[0], currency_code: values[1], price: values[2], is_active: values[3] }], rowCount: 1 };
      }
      if (sql.startsWith("INSERT INTO audit_logs")) throw new Error("audit storage unavailable");
      throw new Error("Unexpected SQL in audit rollback test: " + sql);
    });

    const response = await fetch(baseUrl + "/admin/economy/prices/robe", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ price: 250 }),
    });

    expect(response.status).toBe(500);
    const sql = mocks.query.mock.calls.map(([statement]) => String(statement));
    expect(sql).toContain("ROLLBACK");
    expect(sql).not.toContain("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
