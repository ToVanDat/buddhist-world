import type { Request, Response, NextFunction } from "express";
import { pool } from "../../db/pool.js";

export function requirePermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.auth?.sub;
    if (!userId) {
      res.status(401).json({ error: "Chưa đăng nhập." });
      return;
    }
    try {
      const result = await pool.query<{ allowed: boolean; role: string }>(
        `SELECT u.role,
                CASE
                  WHEN permission_override.effect = 'deny' THEN false
                  WHEN permission_override.effect = 'allow' THEN true
                  ELSE EXISTS (
                    SELECT 1 FROM admin_role_permissions rp
                     WHERE rp.role = u.role AND rp.permission_key = $2
                  )
                END AS allowed
           FROM users u
           LEFT JOIN admin_user_permission_overrides permission_override
             ON permission_override.user_id = u.id AND permission_override.permission_key = $2
          WHERE u.id = $1`,
        [userId, permissionKey],
      );
      const row = result.rows[0];
      if (!row) {
        res.status(401).json({ error: "Tài khoản không còn tồn tại." });
        return;
      }
      if (!row.allowed) {
        res.status(403).json({ error: "Bạn không có quyền thực hiện thao tác này.", permission: permissionKey });
        return;
      }
      next();
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error &&
          (error as { code?: string }).code === "42P01") {
        res.status(503).json({ error: "Permission matrix chưa sẵn sàng. Cần migration 013." });
        return;
      }
      next(error);
    }
  };
}
