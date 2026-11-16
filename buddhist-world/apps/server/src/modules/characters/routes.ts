import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";
import { rateLimit } from "../../middleware/rateLimit.js";

export const charactersRouter = Router();
charactersRouter.use(requireAuth);

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const configBody = z.object({
  baseModelAssetId: uuid,
  presetId: uuid.nullable().optional(),
  itemIds: z.array(uuid).max(20).default([]),
  colors: z.record(z.string().max(40), z.string().regex(/^#[0-9a-fA-F]{6}$/)).default({}),
}).strict();

charactersRouter.get("/catalog", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  if (category.length > 40) { res.status(400).json({ error: "category không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT ci.id, ci.category, ci.slot, ci.skeleton_profile, ci.is_starter, ci.metadata,
            a.id AS asset_id, a.asset_key, a.version, a.name, a.description, a.storage_key,
            a.content_type, a.metadata AS asset_metadata
       FROM character_catalog_items ci
       JOIN world_asset_catalog a ON a.id = ci.asset_id
      WHERE ci.status = 'approved' AND a.status = 'approved' AND a.is_current = true
        AND ($1 = '' OR ci.category = $1)
      ORDER BY ci.category, ci.slot, a.name
      LIMIT 200`,
    [category],
  );
  res.json({ items: result.rows });
});

charactersRouter.get("/presets", async (_req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.slug, p.name, p.description, p.config,
            a.asset_key AS base_model_key, a.storage_key AS base_model_storage_key
       FROM character_presets p
       JOIN world_asset_catalog a ON a.id = p.base_model_asset_id
      WHERE p.visibility = 'public' AND p.status = 'approved'
        AND a.status = 'approved' AND a.is_current = true
      ORDER BY p.name
      LIMIT 100`,
  );
  res.json({ presets: result.rows });
});

charactersRouter.get("/me", async (req, res) => {
  const result = await pool.query(
    `SELECT pc.id, pc.base_model, pc.config, pc.preset_id, pc.updated_at,
            p.name AS preset_name, a.storage_key AS base_model_storage_key,
            a.id AS base_model_asset_id
       FROM player_characters pc
       LEFT JOIN character_presets p ON p.id = pc.preset_id
       LEFT JOIN world_asset_catalog a ON a.asset_key = pc.base_model AND a.is_current = true
      WHERE pc.user_id = $1`,
    [req.auth!.sub],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy nhân vật người chơi." }); return; }
  res.json({ character: result.rows[0] });
});

charactersRouter.put("/me", rateLimit("character-config-save", 20, 60), async (req, res) => {
  const body = configBody.safeParse(req.body);
  if (!body.success || new Set(body.data?.itemIds ?? []).size !== (body.data?.itemIds.length ?? 0)) {
    res.status(400).json({ error: "Cấu hình nhân vật không hợp lệ.", fields: body.success ? undefined : body.error.flatten().fieldErrors });
    return;
  }
  const userId = req.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const baseModel = await client.query<{ asset_key: string; metadata: Record<string, unknown> }>(
      `SELECT asset_key, metadata FROM world_asset_catalog
        WHERE id = $1 AND asset_type = 'character_model' AND status = 'approved' AND is_current = true
        FOR SHARE`,
      [body.data.baseModelAssetId],
    );
    if (!baseModel.rows[0]) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Model nhân vật không tồn tại hoặc chưa được phát hành." });
      return;
    }
    const items = body.data.itemIds.length
      ? await client.query<{ id: string; category: string; slot: string; skeleton_profile: string | null }>(
          `SELECT ci.id, ci.category, ci.slot, ci.skeleton_profile
             FROM character_catalog_items ci
             JOIN world_asset_catalog a ON a.id = ci.asset_id
            WHERE ci.id = ANY($1::uuid[]) AND ci.status = 'approved'
              AND a.status = 'approved' AND a.is_current = true
            FOR SHARE OF ci, a`,
          [body.data.itemIds],
        )
      : { rows: [] as Array<{ id: string; category: string; slot: string; skeleton_profile: string | null }> };
    if (items.rows.length !== body.data.itemIds.length) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "Một hoặc nhiều phụ kiện/trang phục không còn khả dụng." });
      return;
    }
    const occupiedSlots = new Set<string>();
    const skeletonProfile = typeof baseModel.rows[0].metadata.skeletonProfile === "string"
      ? baseModel.rows[0].metadata.skeletonProfile : null;
    for (const item of items.rows) {
      if (item.skeleton_profile && skeletonProfile && item.skeleton_profile !== skeletonProfile) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Asset không tương thích skeleton với model nhân vật." });
        return;
      }
      if (item.category !== "accessory") {
        const slotKey = `${item.category}:${item.slot}`;
        if (occupiedSlots.has(slotKey)) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Không thể trang bị nhiều vật phẩm cho cùng một slot." });
          return;
        }
        occupiedSlots.add(slotKey);
      }
    }
    if (body.data.presetId) {
      const preset = await client.query<{ base_model_asset_id: string }>(
        "SELECT base_model_asset_id FROM character_presets WHERE id = $1 AND visibility = 'public' AND status = 'approved' FOR SHARE",
        [body.data.presetId],
      );
      if (!preset.rows[0] || preset.rows[0].base_model_asset_id !== body.data.baseModelAssetId) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: "Preset không hợp lệ hoặc không khớp model." });
        return;
      }
    }
    const config = {
      schemaVersion: 1,
      baseModelAssetId: body.data.baseModelAssetId,
      presetId: body.data.presetId ?? null,
      itemIds: body.data.itemIds,
      colors: body.data.colors,
    };
    const saved = await client.query(
      `INSERT INTO player_characters (user_id, base_model, preset_id, config, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, now())
       ON CONFLICT (user_id)
       DO UPDATE SET base_model = EXCLUDED.base_model, preset_id = EXCLUDED.preset_id,
                     config = EXCLUDED.config, updated_at = now()
       RETURNING id, user_id, base_model, preset_id, config, updated_at`,
      [userId, baseModel.rows[0].asset_key, body.data.presetId ?? null, JSON.stringify(config)],
    );
    await client.query("COMMIT");
    res.json({ character: saved.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});
