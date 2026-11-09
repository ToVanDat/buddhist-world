import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";

export const worldRouter = Router();
worldRouter.use(requireAuth);

worldRouter.get("/quests", async (req, res) => {
  const result = await pool.query(
    `SELECT q.id, q.title, q.description, q.objectives, q.rewards, q.is_repeatable,
            pq.status, COALESCE(pq.progress, '{}'::jsonb) AS progress,
            pq.accepted_at, pq.completed_at
       FROM world_quests q
       LEFT JOIN player_quests pq ON pq.quest_id = q.id AND pq.user_id = $1
      WHERE q.is_active = true
      ORDER BY q.created_at, q.id`,
    [req.auth!.sub],
  );
  res.json({ quests: result.rows });
});

worldRouter.post("/quests/:questId/accept", async (req, res) => {
  const questId = typeof req.params.questId === "string" ? req.params.questId : "";
  if (!/^[a-z0-9_-]{1,64}$/i.test(questId)) {
    res.status(400).json({ error: "Mã nhiệm vụ không hợp lệ." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const quest = await client.query<{ id: string; is_repeatable: boolean }>(
      "SELECT id, is_repeatable FROM world_quests WHERE id = $1 AND is_active = true FOR SHARE",
      [questId],
    );
    if (!quest.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy nhiệm vụ." });
      return;
    }
    const current = await client.query<{ status: string }>(
      "SELECT status FROM player_quests WHERE user_id = $1 AND quest_id = $2 FOR UPDATE",
      [req.auth!.sub, questId],
    );
    if (current.rows[0]?.status === "active" ||
        (current.rows[0]?.status === "completed" && !quest.rows[0].is_repeatable)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Nhiệm vụ này đã được nhận hoặc hoàn thành." });
      return;
    }
    await client.query(
      `INSERT INTO player_quests (user_id, quest_id, status, progress, accepted_at, completed_at)
       VALUES ($1, $2, 'active', '{}'::jsonb, now(), NULL)
       ON CONFLICT (user_id, quest_id) DO UPDATE
         SET status = 'active', progress = '{}'::jsonb, accepted_at = now(), completed_at = NULL`,
      [req.auth!.sub, questId],
    );
    await client.query("COMMIT");
    res.status(201).json({ questId, status: "active" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

worldRouter.get("/inventory", async (req, res) => {
  const result = await pool.query(
    `SELECT i.id, i.name, i.description, i.category, i.metadata, pi.quantity, pi.acquired_at
       FROM player_inventory pi
       JOIN world_items i ON i.id = pi.item_id
      WHERE pi.user_id = $1 AND pi.quantity > 0
      ORDER BY i.category, i.name`,
    [req.auth!.sub],
  );
  res.json({ items: result.rows });
});
