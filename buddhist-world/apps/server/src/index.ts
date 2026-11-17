import { createServer } from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { attachGateway } from "./realtime/gateway.js";
import { logger } from "./lib/logger.js";
import { pool } from "./db/pool.js";
import { redis } from "./lib/redis.js";
import { startSessionMaintenance } from "./modules/auth/sessionMaintenance.js";

const http = createServer(createApp());

async function attachGatewayWithRetry() {
  let attempt = 0;
  while (true) {
    try {
      return await attachGateway(http);
    } catch (error) {
      attempt += 1;
      const delay = Math.min(500 * (2 ** Math.min(attempt, 4)), 10_000);
      logger.warn({ error, attempt, retryInMs: delay }, "realtime gateway startup waiting for Redis");
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Redis may become ready after PostgreSQL (or vice versa). Keep retrying
// gateway attachment instead of exiting the process on a transient startup race.
const io = await attachGatewayWithRetry();
const stopSessionMaintenance = startSessionMaintenance();
http.listen(env.PORT, () => logger.info(`server listening on :${env.PORT}`));

let shutdownPromise: Promise<void> | undefined;

/** Close the realtime/HTTP listener before releasing shared infrastructure. */
function shutdown(signal: NodeJS.Signals) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    logger.info({ signal }, "graceful shutdown started");

    // Stop periodic work before closing shared infrastructure.
    stopSessionMaintenance();
    // Socket.IO owns the HTTP server lifecycle and closes connected sockets.
    await new Promise<void>((resolve) => io.close(() => resolve()));

    const results = await Promise.allSettled([
      pool.end(),
      redis.quit(),
    ]);
    const failures = results.filter((result) => result.status === "rejected");
    for (const failure of failures) {
      if (failure.status === "rejected") {
        logger.error({ error: failure.reason }, "shutdown resource cleanup failed");
      }
    }

    if (failures.length > 0) process.exitCode = 1;
    logger.info("graceful shutdown complete");
  })();

  return shutdownPromise;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
