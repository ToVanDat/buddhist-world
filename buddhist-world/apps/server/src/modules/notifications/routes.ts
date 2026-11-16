import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const kinds = ["friend_request", "friend_accepted", "chat_message", "system"] as const;
const preferenceBody = z.object({
  preferences: z.array(z.object({
    kind: z.enum(kinds),
    inAppEnabled: z.boolean(),
  })).max(kinds.length),
});
const uuid = z.string().uuid().transform((value) => value.toLowerCase());

function pageFromQuery(query: Record<string, unknown>) {
  const limit = typeof query.limit === "string" ? Number(query.limit) : 30;
  const offset = typeof query.offset === "string" ? Number(query.offset) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100_000) return null;
  return { limit, offset };
}

notificationsRouter.get("/", async (req, res) => {
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const unreadOnly = req.query.unreadOnly === "true";
  const [items, count] = await Promise.all([
    pool.query(
      `SELECT n.id, n.kind, n.payload, n.created_at, n.read_at,
              u.id AS actor_id, u.username AS actor_username, p.display_name AS actor_display_name
         FROM player_notifications n
         LEFT JOIN users u ON u.id = n.actor_id
         LEFT JOIN player_profiles p ON p.user_id = u.id
        WHERE n.user_id = $1 AND ($2::boolean = false OR n.read_at IS NULL)
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT $3 OFFSET $4`,
      [req.auth!.sub, unreadOnly, page.limit, page.offset],
    ),
    pool.query(
      "SELECT count(*)::int AS count FROM player_notifications WHERE user_id = $1 AND read_at IS NULL",
      [req.auth!.sub],
    ),
  ]);
  res.json({
    notifications: items.rows,
    unreadCount: count.rows[0]?.count ?? 0,
    limit: page.limit,
    offset: page.offset,
  });
});

notificationsRouter.post("/:notificationId/read", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.notificationId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã thông báo không hợp lệ." }); return; }
  const result = await pool.query(
    `UPDATE player_notifications SET read_at = COALESCE(read_at, now())
      WHERE id = $1 AND user_id = $2
      RETURNING id, read_at`,
    [parsedId.data, req.auth!.sub],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy thông báo." }); return; }
  res.json(result.rows[0]);
});

notificationsRouter.post("/read-all", async (req, res) => {
  const result = await pool.query(
    `UPDATE player_notifications SET read_at = now()
      WHERE user_id = $1 AND read_at IS NULL
      RETURNING id`,
    [req.auth!.sub],
  );
  res.json({ markedRead: result.rowCount ?? 0 });
});

notificationsRouter.get("/preferences", async (req, res) => {
  const stored = await pool.query(
    "SELECT kind, in_app_enabled FROM player_notification_preferences WHERE user_id = $1",
    [req.auth!.sub],
  );
  const byKind = new Map(stored.rows.map((row) => [row.kind, row.in_app_enabled]));
  res.json({
    preferences: kinds.map((kind) => ({ kind, inAppEnabled: byKind.get(kind) ?? true })),
  });
});

notificationsRouter.put("/preferences", async (req, res) => {
  const parsed = preferenceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dữ liệu không hợp lệ.", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  if (new Set(parsed.data.preferences.map((item) => item.kind)).size !== parsed.data.preferences.length) {
    res.status(400).json({ error: "Mỗi loại thông báo chỉ được xuất hiện một lần." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const preference of parsed.data.preferences) {
      await client.query(
        `INSERT INTO player_notification_preferences (user_id, kind, in_app_enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, kind)
         DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled, updated_at = now()`,
        [req.auth!.sub, preference.kind, preference.inAppEnabled],
      );
    }
    await client.query("COMMIT");
    res.json({ preferences: parsed.data.preferences });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
