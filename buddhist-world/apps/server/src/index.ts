import { createServer } from "node:http";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { attachGateway } from "./realtime/gateway.js";
import { logger } from "./lib/logger.js";
import { pool } from "./db/pool.js";
import { redis } from "./lib/redis.js";

const http = createServer(createApp());
const io = attachGateway(http);
http.listen(env.PORT, () => logger.info(`server listening on :${env.PORT}`));

let shutdownPromise: Promise<void> | undefined;

/** Close the realtime/HTTP listener before releasing shared infrastructure. */
function shutdown(signal: NodeJS.Signals) {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    logger.info({ signal }, "graceful shutdown started");

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
