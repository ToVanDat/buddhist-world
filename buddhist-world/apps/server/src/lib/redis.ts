import { Redis } from "ioredis";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 2,
});

redis.on("ready", () => logger.info("redis connection ready"));
redis.on("reconnecting", (delay: number) => logger.warn({ delay }, "redis reconnecting"));
redis.on("end", () => logger.warn("redis connection ended"));
redis.on("error", (error: Error) => logger.error({ error }, "redis connection error"));
