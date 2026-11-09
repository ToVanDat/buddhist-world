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

async function shutdown() {
  logger.info("shutting down");
  io.close();
  http.close();
  await pool.end().catch(() => {});
  redis.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
