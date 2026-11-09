import { Router } from "express";
import { pool } from "../../db/pool.js";
import { redis } from "../../lib/redis.js";

export const healthRouter = Router();
healthRouter.get("/", (_req, res) => { res.json({ status: "ok" }); });
healthRouter.get("/ready", async (_req, res) => {
  const checks = { postgres: false, redis: false };
  try { await pool.query("SELECT 1"); checks.postgres = true; } catch {}
  try { checks.redis = (await redis.ping()) === "PONG"; } catch {}
  const ok = checks.postgres && checks.redis;
  res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "degraded", checks });
});
