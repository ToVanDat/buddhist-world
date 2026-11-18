import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { redis } from "./redis.js";

/** INCR + EXPIRE trong một Lua script để không tạo key rate-limit vĩnh viễn nếu process dừng giữa chừng. */
export async function hit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const k = `rl:${key}`;
  const count = Number(await redis.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]); end; return n",
    1, k, windowSec,
  ));
  return count <= limit;
}

export function rateLimit(name: string, limit: number, windowSec: number, identity?: (req: Request) => string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const subject = identity?.(req) ?? req.ip;
      if (!(await hit(`${name}:${subject}`, limit, windowSec))) {
        res.status(429).json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau." });
        return;
      }
    } catch (error) {
      // Không bỏ qua rate limit khi Redis hỏng ở production.
      if (env.NODE_ENV === "production") {
        res.status(503).json({ error: "Dịch vụ bảo vệ yêu cầu tạm thời không khả dụng." });
        return;
      }
      next();
      return;
    }
    next();
  };
}
