import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireTables } from "../../db/requireTables.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requireRole } from "../auth/requireRole.js";
import { requirePermission } from "../auth/requirePermission.js";

export const adminPermissionsRouter = Router();
adminPermissionsRouter.use(requireAuth, requireTables("admin_permissions", "admin_role_permissions", "admin_user_permission_overrides"), requireRole("admin"), requirePermission("permissions.manage"));

const roleSchema = z.enum(["player", "moderator", "admin"]);
const permissionKey = z.string().min(3).max(100).regex(/^[a-z][a-z0-9_.-]*$/);
const roleBody = z.object({ permissionKeys: z.array(permissionKey).max(100) }).strict();
const overrideBody = z.object({
  permissionKey,
  effect: z.enum(["allow", "deny"]),
}).strict();

adminPermissionsRouter.get("/", async (_req, res) => {
  const [permissions, roles, overrides] = await Promise.all([
    pool.query("SELECT permission_key, description FROM admin_permissions ORDER BY permission_key"),
    pool.query("SELECT role, permission_key FROM admin_role_permissions ORDER BY role, permission_key"),
    pool.query(
      `SELECT o.user_id, u.username, o.permission_key, o.effect, o.updated_at
         FROM admin_user_permission_overrides o
         JOIN users u ON u.id = o.user_id
        ORDER BY u.username, o.permission_key`,
    ),
  ]);
  res.json({ permissions: permissions.rows, rolePermissions: roles.rows, userOverrides: overrides.rows });
});

adminPermissionsRouter.put("/roles/:role", async (req, res) => {
  const role = roleSchema.safeParse(req.params.role);
  const body = roleBody.safeParse(req.body);
  if (!role.success || !body.success) {
    res.status(400).json({ error: "Dữ liệu permission matrix không hợp lệ." });
    return;
  }
  if (role.data === "admin" && !body.data.permissionKeys.includes("permissions.manage")) {
    res.status(409).json({ error: "Không thể loại bỏ quyền quản lý permission matrix khỏi vai trò admin." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('bw-permission-matrix-mutation', 0))");
    const existing = await client.query<{ permission_key: string }>(
      "SELECT permission_key FROM admin_permissions WHERE permission_key = ANY($1::text[])",
      [body.data.permissionKeys],
    );
    if (existing.rowCount !== body.data.permissionKeys.length) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Có permission key không tồn tại." });
      return;
    }
    await client.query("DELETE FROM admin_role_permissions WHERE role = $1", [role.data]);
    if (body.data.permissionKeys.length) {
      await client.query(
        "INSERT INTO admin_role_permissions (role, permission_key) SELECT $1, unnest($2::text[])",
        [role.data, body.data.permissionKeys],
      );
    }
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'admin_role_permissions_updated', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({ role: role.data, permissionKeys: body.data.permissionKeys }), req.ip],
    );
    await client.query("COMMIT");
    res.json({ role: role.data, permissionKeys: body.data.permissionKeys });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

adminPermissionsRouter.put("/users/:userId", async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  const body = overrideBody.safeParse(req.body);
  if (!userId.success || !body.success) {
    res.status(400).json({ error: "Dữ liệu permission override không hợp lệ." });
    return;
  }
  const target = await pool.query<{ role: string }>("SELECT role FROM users WHERE id = $1", [userId.data]);
  if (!target.rows[0]) { res.status(404).json({ error: "Không tìm thấy tài khoản." }); return; }
  const permission = await pool.query("SELECT 1 FROM admin_permissions WHERE permission_key = $1", [body.data.permissionKey]);
  if (!permission.rowCount) { res.status(400).json({ error: "Permission key không tồn tại." }); return; }
  if (body.data.permissionKey === "permissions.manage" && body.data.effect === "deny" &&
      (userId.data === req.auth!.sub || target.rows[0].role === "admin")) {
    res.status(409).json({ error: "Không thể khóa quyền quản lý permission của tài khoản admin." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO admin_user_permission_overrides (user_id, permission_key, effect, created_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, permission_key)
       DO UPDATE SET effect = EXCLUDED.effect, created_by = EXCLUDED.created_by, updated_at = now()
       RETURNING user_id, permission_key, effect, updated_at`,
      [userId.data, body.data.permissionKey, body.data.effect, req.auth!.sub],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'admin_user_permission_override_updated', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify(result.rows[0]), req.ip],
    );
    await client.query("COMMIT");
    res.json({ override: result.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

adminPermissionsRouter.delete("/users/:userId/:key", async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  const key = permissionKey.safeParse(req.params.key);
  if (!userId.success || !key.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      "DELETE FROM admin_user_permission_overrides WHERE user_id = $1 AND permission_key = $2 RETURNING user_id",
      [userId.data, key.data],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy permission override." });
      return;
    }
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'admin_user_permission_override_removed', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({ userId: userId.data, permissionKey: key.data }), req.ip],
    );
    await client.query("COMMIT");
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});
