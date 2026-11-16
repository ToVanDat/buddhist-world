import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireTables } from "../../db/requireTables.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requirePermission } from "../auth/requirePermission.js";

export const adminWorldContentRouter = Router();
adminWorldContentRouter.use(requireAuth, requireTables("world_npcs", "world_quests", "world_items", "admin_permissions", "admin_role_permissions", "admin_user_permission_overrides"));

const contentId = z.string().min(2).max(100).regex(/^[a-z0-9][a-z0-9_-]*$/);
const jsonObject = z.record(z.string(), z.unknown());
const npcBody = z.object({
  id: contentId,
  regionId: z.string().min(1).max(100),
  name: z.string().min(1).max(160),
  title: z.string().max(160).default(""),
  position: z.object({ x: z.number().finite().min(-100_000).max(100_000), y: z.number().finite().min(-100_000).max(100_000), z: z.number().finite().min(-100_000).max(100_000) }).strict(),
  dialogue: z.array(jsonObject).max(100).default([]),
  isActive: z.boolean().default(true),
}).strict();
const npcPatch = npcBody.omit({ id: true }).partial().strict();

const questBody = z.object({
  id: contentId,
  npcId: contentId.nullable().optional(),
  title: z.string().min(1).max(180),
  description: z.string().min(1).max(4000),
  objectives: z.array(jsonObject).max(100).default([]),
  rewards: z.array(jsonObject).max(50).default([]),
  isRepeatable: z.boolean().default(false),
  isActive: z.boolean().default(false),
}).strict();
const questPatch = questBody.omit({ id: true }).partial().strict();

const itemBody = z.object({
  id: contentId,
  name: z.string().min(1).max(160),
  description: z.string().max(2000).default(""),
  category: z.enum(["consumable", "quest", "cosmetic", "offering"]),
  stackLimit: z.number().int().min(1).max(9999).default(99),
  metadata: jsonObject.default({}),
}).strict();
const itemPatch = itemBody.omit({ id: true }).partial().strict();

async function writeAudit(userId: string, action: string, detail: unknown, ip: string | undefined) {
  await pool.query(
    "INSERT INTO audit_logs (user_id, action, detail, ip) VALUES ($1, $2, $3::jsonb, $4)",
    [userId, action, JSON.stringify(detail), ip ?? null],
  );
}

adminWorldContentRouter.get("/npcs", requirePermission("npcs.manage"), async (_req, res) => {
  const result = await pool.query("SELECT * FROM world_npcs ORDER BY region_id, name LIMIT 500");
  res.json({ npcs: result.rows });
});

adminWorldContentRouter.post("/npcs", requirePermission("npcs.manage"), async (req, res) => {
  const body = npcBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dữ liệu NPC không hợp lệ.", fields: body.error.flatten().fieldErrors }); return; }
  const { position, ...data } = body.data;
  const result = await pool.query(
    `INSERT INTO world_npcs (id, region_id, name, title, x, y, z, dialogue, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING *`,
    [data.id, data.regionId, data.name, data.title, position.x, position.y, position.z, JSON.stringify(data.dialogue), data.isActive],
  );
  await writeAudit(req.auth!.sub, "world_npc_created", { npcId: data.id }, req.ip);
  res.status(201).json({ npc: result.rows[0] });
});

adminWorldContentRouter.patch("/npcs/:id", requirePermission("npcs.manage"), async (req, res) => {
  const id = contentId.safeParse(req.params.id);
  const body = npcPatch.safeParse(req.body);
  if (!id.success || !body.success || Object.keys(body.data ?? {}).length === 0) {
    res.status(400).json({ error: "Dữ liệu cập nhật NPC không hợp lệ." }); return;
  }
  const fields: string[] = [];
  const values: unknown[] = [id.data];
  const add = (column: string, value: unknown, cast = "") => { values.push(value); fields.push(`${column} = $${values.length}${cast}`); };
  if (body.data.regionId !== undefined) add("region_id", body.data.regionId);
  if (body.data.name !== undefined) add("name", body.data.name);
  if (body.data.title !== undefined) add("title", body.data.title);
  if (body.data.position?.x !== undefined) add("x", body.data.position.x);
  if (body.data.position?.y !== undefined) add("y", body.data.position.y);
  if (body.data.position?.z !== undefined) add("z", body.data.position.z);
  if (body.data.dialogue !== undefined) add("dialogue", JSON.stringify(body.data.dialogue), "::jsonb");
  if (body.data.isActive !== undefined) add("is_active", body.data.isActive);
  const result = await pool.query(`UPDATE world_npcs SET ${fields.join(", ")} WHERE id = $1 RETURNING *`, values);
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy NPC." }); return; }
  await writeAudit(req.auth!.sub, "world_npc_updated", { npcId: id.data, fields: Object.keys(body.data) }, req.ip);
  res.json({ npc: result.rows[0] });
});

adminWorldContentRouter.get("/quests", requirePermission("quests.manage"), async (_req, res) => {
  const result = await pool.query(
    `SELECT q.*, n.name AS npc_name FROM world_quests q
      LEFT JOIN world_npcs n ON n.id = q.npc_id
      ORDER BY q.created_at DESC LIMIT 500`,
  );
  res.json({ quests: result.rows });
});

adminWorldContentRouter.post("/quests", requirePermission("quests.manage"), async (req, res) => {
  const body = questBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dữ liệu quest không hợp lệ.", fields: body.error.flatten().fieldErrors }); return; }
  const result = await pool.query(
    `INSERT INTO world_quests (id, npc_id, title, description, objectives, rewards, is_repeatable, is_active)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8) RETURNING *`,
    [body.data.id, body.data.npcId ?? null, body.data.title, body.data.description,
     JSON.stringify(body.data.objectives), JSON.stringify(body.data.rewards), body.data.isRepeatable, body.data.isActive],
  );
  await writeAudit(req.auth!.sub, "world_quest_created", { questId: body.data.id }, req.ip);
  res.status(201).json({ quest: result.rows[0] });
});

adminWorldContentRouter.patch("/quests/:id", requirePermission("quests.manage"), async (req, res) => {
  const id = contentId.safeParse(req.params.id);
  const body = questPatch.safeParse(req.body);
  if (!id.success || !body.success || Object.keys(body.data ?? {}).length === 0) {
    res.status(400).json({ error: "Dữ liệu cập nhật quest không hợp lệ." }); return;
  }
  const map: Record<string, string> = {
    npcId: "npc_id", title: "title", description: "description",
    objectives: "objectives", rewards: "rewards", isRepeatable: "is_repeatable", isActive: "is_active",
  };
  const values: unknown[] = [id.data];
  const fields = Object.entries(body.data).map(([key, value]) => {
    values.push(key === "objectives" || key === "rewards" ? JSON.stringify(value) : value);
    return `${map[key]} = $${values.length}${key === "objectives" || key === "rewards" ? "::jsonb" : ""}`;
  });
  const result = await pool.query(`UPDATE world_quests SET ${fields.join(", ")} WHERE id = $1 RETURNING *`, values);
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy quest." }); return; }
  await writeAudit(req.auth!.sub, "world_quest_updated", { questId: id.data, fields: Object.keys(body.data) }, req.ip);
  res.json({ quest: result.rows[0] });
});

adminWorldContentRouter.get("/items", requirePermission("items.manage"), async (_req, res) => {
  const result = await pool.query(
    `SELECT i.*, p.currency_code, p.price, p.is_active AS price_active
       FROM world_items i LEFT JOIN world_item_prices p ON p.item_id = i.id
      ORDER BY i.category, i.name LIMIT 500`,
  );
  res.json({ items: result.rows });
});

adminWorldContentRouter.post("/items", requirePermission("items.manage"), async (req, res) => {
  const body = itemBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dữ liệu item không hợp lệ.", fields: body.error.flatten().fieldErrors }); return; }
  const result = await pool.query(
    `INSERT INTO world_items (id, name, description, category, stack_limit, metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`,
    [body.data.id, body.data.name, body.data.description, body.data.category, body.data.stackLimit, JSON.stringify(body.data.metadata)],
  );
  await writeAudit(req.auth!.sub, "world_item_created", { itemId: body.data.id }, req.ip);
  res.status(201).json({ item: result.rows[0] });
});

adminWorldContentRouter.patch("/items/:id", requirePermission("items.manage"), async (req, res) => {
  const id = contentId.safeParse(req.params.id);
  const body = itemPatch.safeParse(req.body);
  if (!id.success || !body.success || Object.keys(body.data ?? {}).length === 0) {
    res.status(400).json({ error: "Dữ liệu cập nhật item không hợp lệ." }); return;
  }
  const map: Record<string, string> = {
    name: "name", description: "description", category: "category",
    stackLimit: "stack_limit", metadata: "metadata",
  };
  const values: unknown[] = [id.data];
  const fields = Object.entries(body.data).map(([key, value]) => {
    values.push(key === "metadata" ? JSON.stringify(value) : value);
    return `${map[key]} = $${values.length}${key === "metadata" ? "::jsonb" : ""}`;
  });
  const result = await pool.query(`UPDATE world_items SET ${fields.join(", ")} WHERE id = $1 RETURNING *`, values);
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy item." }); return; }
  await writeAudit(req.auth!.sub, "world_item_updated", { itemId: id.data, fields: Object.keys(body.data) }, req.ip);
  res.json({ item: result.rows[0] });
});
