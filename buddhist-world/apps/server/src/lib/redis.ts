import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  connectTimeout: 5_000,
  maxRetriesPerRequest: 2,
  // Fail fast while Redis is unavailable; callers can return degraded/503
  // instead of accumulating an unbounded offline command queue.
  enableOfflineQueue: false,
  retryStrategy: (attempt: number) => Math.min(attempt * 250, 5_000),
});

redis.on("ready", () => logger.info("redis connection ready"));
redis.on("reconnecting", (delay: number) => logger.warn({ delay }, "redis reconnecting"));
redis.on("end", () => logger.warn("redis connection ended"));
redis.on("error", (error: Error) => logger.error({ error }, "redis connection error"));
