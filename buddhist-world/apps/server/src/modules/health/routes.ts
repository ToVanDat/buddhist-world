import { Router } from "express";
import { pool } from "../../db/pool.js";
import { redis } from "../../lib/redis.js";
import { hasRequiredDemoSchema } from "./readiness.js";

export const healthRouter = Router();
healthRouter.get("/", (_req, res) => { res.json({ status: "ok" }); });
healthRouter.get("/ready", async (_req, res) => {
  const checks = { postgres: false, redis: false, migrations: false };
  try { await pool.query("SELECT 1"); checks.postgres = true; } catch {}
  try { checks.redis = (await redis.ping()) === "PONG"; } catch {}
  try {
    const applied = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
    checks.migrations = hasRequiredDemoSchema(applied.rows.map((row) => row.name));
  } catch {}
  const ok = checks.postgres && checks.redis && checks.migrations;
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "degraded", checks });
});
