import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("./pool.js", () => ({
  pool: { query: mocks.query },
}));

import { requireTables } from "./requireTables.js";

describe("requireTables schema readiness", () => {
  beforeEach(() => {
    mocks.query.mockReset();
  });

  it("reports missing tables without guessing a migration version", async () => {
    mocks.query.mockResolvedValue({
      rows: [{ table_name: "party_members", available: false }],
    });
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();

    await requireTables("party_members")(
      {} as Request,
      { status, json } as unknown as Response,
      next as NextFunction,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: "Module schema chưa sẵn sàng.",
      missing: ["party_members"],
    });
    expect(JSON.stringify(json.mock.calls)).not.toContain("migration 013");
    expect(next).not.toHaveBeenCalled();
  });

  it("continues when every required table is available", async () => {
    mocks.query.mockResolvedValue({
      rows: [{ table_name: "users", available: true }],
    });
    const next = vi.fn();

    await requireTables("users")(
      {} as Request,
      {} as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it("passes database errors to Express error handling", async () => {
    const failure = new Error("database unavailable");
    mocks.query.mockRejectedValue(failure);
    const next = vi.fn();

    await requireTables("users")(
      {} as Request,
      {} as Response,
      next as NextFunction,
    );

    expect(next).toHaveBeenCalledWith(failure);
  });
});
