import type { Request, Response, NextFunction } from "express";
import { redis } from "./redis.js";

/** Cửa sổ cố định dựa trên Redis. Trả về true nếu còn trong giới hạn. */
export async function hit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const k = `rl:${key}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.expire(k, windowSec);
  return n <= limit;
}

export function rateLimit(name: string, limit: number, windowSec: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await hit(`${name}:${req.ip}`, limit, windowSec))) {
        res.status(429).json({ error: "Quá nhiều yêu cầu, vui lòng thử lại sau." });
        return;
      }
    } catch {
      // Redis lỗi: fail-open cho giới hạn REST nhưng vẫn ghi log ở tầng trên.
    }
    next();
  };
}
