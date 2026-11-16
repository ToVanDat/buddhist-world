import type { Redis as RedisClient } from "ioredis";
import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Attach lifecycle/error observability to every ioredis connection.
 * ioredis emits connection errors through EventEmitter; every client,
 * including duplicate pub/sub clients, must have an error listener.
 */
export function observeRedisClient(client: RedisClient, name: string): RedisClient {
  client.on("error", (error: Error) => {
    logger.warn({ error, redisClient: name, status: client.status }, "Redis client error");
  });
  client.on("reconnecting", (delay: number) => {
    logger.warn({ redisClient: name, delayMs: delay }, "Redis reconnecting");
  });
  client.on("ready", () => {
    logger.info({ redisClient: name }, "Redis client ready");
  });
  client.on("end", () => {
    logger.error({ redisClient: name }, "Redis connection ended");
  });
  return client;
}

export const redis = observeRedisClient(
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      // Bounded exponential backoff; keep retrying while Redis is temporarily unavailable.
      return Math.min(250 * 2 ** Math.min(times - 1, 5), 8_000);
    },
  }),
  "primary",
);
