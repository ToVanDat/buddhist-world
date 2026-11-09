import { createServer } from "node:http";
import { createApp } from "../app.js";
import { attachGateway } from "../realtime/gateway.js";
import { pool } from "../db/pool.js";
import { redis } from "../lib/redis.js";

process.on("message", (message: unknown) => {
  if (!message || typeof message !== "object" || (message as { type?: string }).type !== "metrics") return;
  const id = (message as { id?: string }).id;
  process.send?.({
    type: "metrics",
    id,
    cpu: process.cpuUsage(),
    memory: process.memoryUsage(),
  });
});

const port = Number(process.env.BW_GATEWAY_TEST_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("BW_GATEWAY_TEST_PORT must be a valid TCP port");
}

const http = createServer(createApp());
const io = await attachGateway(http);
http.listen(port, "127.0.0.1", () => {
  process.stdout.write("BW_GATEWAY_READY\n");
});

let closing: Promise<void> | undefined;
async function shutdown() {
  if (closing) return closing;
  closing = (async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await Promise.allSettled([pool.end(), redis.quit()]);
  })();
  return closing;
}

process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
