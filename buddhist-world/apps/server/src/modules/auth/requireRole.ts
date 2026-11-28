import type { Request, Response, NextFunction } from "express";
import { pool } from "../../db/pool.js";

export type AppRole = "player" | "moderator" | "admin";

/**
 * Resolve the current role from PostgreSQL on every protected admin request.
 * A stale JWT role claim must never retain privileges after a role change.
 */
export function requireRole(...allowedRoles: AppRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.auth?.sub;
    if (!userId) {
      res.status(401).json({ error: "Chưa đăng nhập." });
      return;
    }
    try {
      const result = await pool.query<{ role: AppRole }>(
        "SELECT role FROM users WHERE id = $1",
        [userId],
      );
      const currentRole = result.rows[0]?.role;
      if (!currentRole) {
        res.status(401).json({ error: "Tài khoản không còn tồn tại." });
        return;
      }
      if (!allowedRoles.includes(currentRole)) {
        res.status(403).json({ error: "Bạn không có quyền thực hiện thao tác này." });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
