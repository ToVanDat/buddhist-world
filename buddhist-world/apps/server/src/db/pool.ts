import pg from "pg";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

// Keep the pool bounded; timeouts prevent a dead database from holding
// application requests indefinitely. Revisit max against the total gateway count.
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (error) => {
  // Idle client errors are otherwise easy to miss and can precede request failures.
  logger.error({ error }, "postgres pool idle client error");
});
