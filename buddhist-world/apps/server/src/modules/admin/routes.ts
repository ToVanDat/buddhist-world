import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";
import { validateQuestObjectives, validateQuestRewards } from "../world/questRules.js";

export const adminWorldRouter = Router();
adminWorldRouter.use(requireAuth);

/** Always resolve the current database role; never authorize CMS writes from a stale JWT role claim. */
async function requireCurrentAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await pool.query<{ role: string }>(
      "SELECT role FROM users WHERE id = $1",
      [req.auth!.sub],
    );
    if (result.rows[0]?.role !== "admin") {
      res.status(403).json({ error: "Bạn không có quyền quản trị nội dung thế giới." });
      return;
    }
    next();
  } catch (error) {
    next(error);
  }
}
adminWorldRouter.use(requireCurrentAdmin);

const contentId = z.string().regex(/^[a-z0-9_-]{1,64}$/i);
const npcBody = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().max(160),
  isActive: z.boolean(),
}).strict();
const itemBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000),
  category: z.enum(["consumable", "quest", "cosmetic", "offering"]),
  stackLimit: z.number().int().positive().max(100_000),
  metadata: z.record(z.unknown()),
}).strict();
const questBody = z.object({
  npcId: contentId.nullable(),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  objectives: z.unknown(),
  rewards: z.unknown(),
  isRepeatable: z.boolean(),
  isActive: z.boolean(),
}).strict();
const achievementBody = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000),
  category: z.enum(["exploration", "mindfulness"]),
  icon: z.string().trim().min(1).max(16),
  targetIds: z.array(contentId).min(1).max(64).refine((ids) => new Set(ids).size === ids.length),
  requiredCount: z.number().int().positive(),
  isActive: z.boolean(),
}).strict();

function validPathId(value: string): boolean {
  return contentId.safeParse(value).success;
}

async function writeAudit(
  client: import("pg").PoolClient,
  req: Request,
  entityType: string,
  entityId: string,
) {
  await client.query(
    "INSERT INTO audit_logs (user_id, action, ip, detail) VALUES ($1, 'world_content_updated', $2, $3::jsonb)",
    [req.auth!.sub, req.ip, JSON.stringify({ entityType, entityId })],
  );
}

adminWorldRouter.get("/world/content", async (_req, res) => {
  const [npcs, quests, items, achievements] = await Promise.all([
    pool.query(
      `SELECT id, region_id, name, title, x, y, z, is_active,
              to_jsonb(n)->'dialogue_graph' AS dialogue_graph,
              to_jsonb(n)->'schedule' AS schedule
         FROM world_npcs n ORDER BY id`,
    ),
    pool.query(
      "SELECT id, npc_id, title, description, objectives, rewards, is_repeatable, is_active FROM world_quests ORDER BY created_at, id",
    ),
    pool.query(
      "SELECT id, name, description, category, stack_limit, metadata FROM world_items ORDER BY category, id",
    ),
    pool.query(
      "SELECT id, title, description, category, icon, target_ids, required_count, is_active FROM world_achievements ORDER BY category, id",
    ),
  ]);
  res.json({
    npcs: npcs.rows,
    quests: quests.rows,
    items: items.rows,
    achievements: achievements.rows,
  });
});

adminWorldRouter.put("/world/npcs/:npcId", async (req, res) => {
  const npcId = typeof req.params.npcId === "string" ? req.params.npcId : "";
  const parsed = npcBody.safeParse(req.body);
  if (!validPathId(npcId) || !parsed.success) {
    res.status(400).json({ error: "Dữ liệu NPC không hợp lệ." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE world_npcs SET name = $2, title = $3, is_active = $4 WHERE id = $1 RETURNING id",
      [npcId, parsed.data.name, parsed.data.title, parsed.data.isActive],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy NPC." });
      return;
    }
    await writeAudit(client, req, "npc", npcId);
    await client.query("COMMIT");
    res.json({ id: npcId, updated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

adminWorldRouter.put("/world/items/:itemId", async (req, res) => {
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";
  const parsed = itemBody.safeParse(req.body);
  if (!validPathId(itemId) || !parsed.success) {
    res.status(400).json({ error: "Dữ liệu vật phẩm không hợp lệ." });
    return;
  }
  const useTargetId = parsed.data.metadata.useTargetId;
  if (useTargetId !== undefined && (typeof useTargetId !== "string" || !validPathId(useTargetId))) {
    res.status(400).json({ error: "Điểm sử dụng vật phẩm không hợp lệ." });
    return;
  }
  if (parsed.data.category === "offering" && typeof useTargetId !== "string") {
    res.status(400).json({ error: "Vật phẩm dâng cúng phải có useTargetId." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const item = await client.query("SELECT id FROM world_items WHERE id = $1 FOR UPDATE", [itemId]);
    if (!item.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy vật phẩm." });
      return;
    }
    const inventory = await client.query<{ max_quantity: number }>(
      "SELECT COALESCE(max(quantity), 0)::int AS max_quantity FROM player_inventory WHERE item_id = $1",
      [itemId],
    );
    if (parsed.data.stackLimit < (inventory.rows[0]?.max_quantity ?? 0)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Giới hạn stack mới thấp hơn số lượng đang có trong túi người chơi." });
      return;
    }
    await client.query(
      `UPDATE world_items SET name = $2, description = $3, category = $4,
         stack_limit = $5, metadata = $6::jsonb WHERE id = $1`,
      [itemId, parsed.data.name, parsed.data.description, parsed.data.category,
        parsed.data.stackLimit, JSON.stringify(parsed.data.metadata)],
    );
    await writeAudit(client, req, "item", itemId);
    await client.query("COMMIT");
    res.json({ id: itemId, updated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

adminWorldRouter.put("/world/quests/:questId", async (req, res) => {
  const questId = typeof req.params.questId === "string" ? req.params.questId : "";
  const parsed = questBody.safeParse(req.body);
  if (!validPathId(questId) || !parsed.success) {
    res.status(400).json({ error: "Dữ liệu nhiệm vụ không hợp lệ." });
    return;
  }
  let objectives;
  let rewards;
  try {
    objectives = validateQuestObjectives(parsed.data.objectives);
    rewards = validateQuestRewards(parsed.data.rewards);
  } catch {
    res.status(400).json({ error: "Mục tiêu hoặc phần thưởng không đúng hợp đồng gameplay." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`world-content:quest:${questId}`]);
    const current = await client.query<{ objectives: unknown; rewards: unknown }>(
      "SELECT objectives, rewards FROM world_quests WHERE id = $1 FOR UPDATE",
      [questId],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy nhiệm vụ." });
      return;
    }
    if (parsed.data.npcId) {
      const npc = await client.query("SELECT id FROM world_npcs WHERE id = $1 AND is_active = true FOR SHARE", [parsed.data.npcId]);
      if (!npc.rows[0]) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "NPC giao nhiệm vụ không tồn tại hoặc đang tắt." });
        return;
      }
    }
    if (rewards.length) {
      const itemIds = rewards.map((reward) => reward.itemId);
      const items = await client.query<{ id: string }>(
        "SELECT id FROM world_items WHERE id = ANY($1::text[]) ORDER BY id FOR SHARE",
        [itemIds],
      );
      if (items.rows.length !== new Set(itemIds).size) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Phần thưởng tham chiếu vật phẩm không tồn tại." });
        return;
      }
    }
    const activePlayers = await client.query(
      "SELECT 1 FROM player_quests WHERE quest_id = $1 AND status = 'active' LIMIT 1",
      [questId],
    );
    const objectivesChanged = JSON.stringify(current.rows[0].objectives) !== JSON.stringify(objectives);
    const rewardsChanged = JSON.stringify(current.rows[0].rewards) !== JSON.stringify(rewards);
    if (activePlayers.rows.length && (objectivesChanged || rewardsChanged)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Không thể đổi mục tiêu/phần thưởng khi người chơi đang thực hiện nhiệm vụ." });
      return;
    }
    await client.query(
      `UPDATE world_quests SET npc_id = $2, title = $3, description = $4,
         objectives = $5::jsonb, rewards = $6::jsonb, is_repeatable = $7, is_active = $8
       WHERE id = $1`,
      [questId, parsed.data.npcId, parsed.data.title, parsed.data.description,
        JSON.stringify(objectives), JSON.stringify(rewards), parsed.data.isRepeatable, parsed.data.isActive],
    );
    await writeAudit(client, req, "quest", questId);
    await client.query("COMMIT");
    res.json({ id: questId, updated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

adminWorldRouter.put("/world/achievements/:achievementId", async (req, res) => {
  const achievementId = typeof req.params.achievementId === "string" ? req.params.achievementId : "";
  const parsed = achievementBody.safeParse(req.body);
  if (!validPathId(achievementId) || !parsed.success ||
      parsed.data.requiredCount > parsed.data.targetIds.length) {
    res.status(400).json({ error: "Dữ liệu thành tựu không hợp lệ." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE world_achievements SET title = $2, description = $3, category = $4,
         icon = $5, target_ids = $6::text[], required_count = $7, is_active = $8
       WHERE id = $1 RETURNING id`,
      [achievementId, parsed.data.title, parsed.data.description, parsed.data.category,
        parsed.data.icon, parsed.data.targetIds, parsed.data.requiredCount, parsed.data.isActive],
    );
    if (!updated.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy thành tựu." });
      return;
    }
    await writeAudit(client, req, "achievement", achievementId);
    await client.query("COMMIT");
    res.json({ id: achievementId, updated: true });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
