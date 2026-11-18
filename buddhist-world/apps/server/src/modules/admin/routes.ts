import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requireRole } from "../auth/requireRole.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("admin"));

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const roleBody = z.object({ role: z.enum(["player", "moderator", "admin"]) });

function pageFromQuery(query: Record<string, unknown>) {
  const limit = typeof query.limit === "string" ? Number(query.limit) : 50;
  const offset = typeof query.offset === "string" ? Number(query.offset) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100_000) return null;
  return { limit, offset };
}

adminRouter.get("/users", async (req, res) => {
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (query.length > 80) { res.status(400).json({ error: "Từ khóa tìm kiếm quá dài." }); return; }
  const result = await pool.query(
    `SELECT u.id, u.email, u.username, u.role, u.created_at, p.display_name
       FROM users u
       LEFT JOIN player_profiles p ON p.user_id = u.id
      WHERE $1::text = '' OR u.email ILIKE $2 OR u.username ILIKE $2 OR p.display_name ILIKE $2
      ORDER BY u.created_at DESC, u.id
      LIMIT $3 OFFSET $4`,
    [query, `%${query}%`, page.limit, page.offset],
  );
  res.json({ users: result.rows, limit: page.limit, offset: page.offset });
});

adminRouter.get("/audit-logs", async (req, res) => {
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const userId = typeof req.query.userId === "string" ? uuid.safeParse(req.query.userId) : null;
  if (userId && !userId.success) { res.status(400).json({ error: "userId không hợp lệ." }); return; }
  const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
  if (action.length > 80) { res.status(400).json({ error: "action quá dài." }); return; }
  const result = await pool.query(
    `SELECT a.id, a.user_id, u.username, a.action, a.detail, a.ip, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
      WHERE ($1::uuid IS NULL OR a.user_id = $1)
        AND ($2 = '' OR a.action = $2)
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $3 OFFSET $4`,
    [userId?.success ? userId.data : null, action, page.limit, page.offset],
  );
  res.json({ auditLogs: result.rows, limit: page.limit, offset: page.offset });
});

adminRouter.patch("/users/:userId/role", async (req, res) => {
  const targetId = uuid.safeParse(req.params.userId);
  const parsedBody = roleBody.safeParse(req.body);
  if (!targetId.success || !parsedBody.success) {
    res.status(400).json({
      error: "Dữ liệu không hợp lệ.",
      fields: parsedBody.success ? undefined : parsedBody.error.flatten().fieldErrors,
    });
    return;
  }
  const actorId = req.auth!.sub;
  if (actorId === targetId.data && parsedBody.data.role !== "admin") {
    res.status(409).json({ error: "Không thể tự hạ quyền quản trị của chính mình." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize role changes so two administrators cannot concurrently demote the last admin.
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('bw-admin-role-mutation', 0))");
    const actor = await client.query<{ role: string }>(
      "SELECT role FROM users WHERE id = $1 FOR UPDATE",
      [actorId],
    );
    if (actor.rows[0]?.role !== "admin") {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Quyền quản trị đã thay đổi. Vui lòng đăng nhập lại." });
      return;
    }

    const target = await client.query<{ role: "player" | "moderator" | "admin" }>(
      "SELECT role FROM users WHERE id = $1 FOR UPDATE",
      [targetId.data],
    );
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy tài khoản." });
      return;
    }
    const previousRole = target.rows[0].role;
    if (previousRole === "admin" && parsedBody.data.role !== "admin") {
      const count = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM users WHERE role = 'admin'",
      );
      if (Number(count.rows[0]?.count ?? 0) <= 1) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Không thể hạ quyền quản trị viên cuối cùng." });
        return;
      }
    }

    await client.query("UPDATE users SET role = $2 WHERE id = $1", [targetId.data, parsedBody.data.role]);
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'admin_role_changed', $2::jsonb, $3)`,
      [actorId, JSON.stringify({ targetUserId: targetId.data, previousRole, newRole: parsedBody.data.role }), req.ip],
    );
    await client.query("COMMIT");
    res.json({ userId: targetId.data, previousRole, role: parsedBody.data.role });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
