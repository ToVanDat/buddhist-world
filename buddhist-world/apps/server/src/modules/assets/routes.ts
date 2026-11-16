import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requirePermission } from "../auth/requirePermission.js";

export const assetsRouter = Router();
export const adminAssetsRouter = Router();

assetsRouter.use(requireAuth);

const assetTypes = [
  "character_model", "character_part", "clothing", "accessory",
  "animation", "cinematic", "vfx", "audio", "environment",
  "npc", "texture", "material", "ui",
] as const;
const assetType = z.enum(assetTypes);
const assetKey = z.string().min(2).max(160).regex(/^[a-z0-9][a-z0-9._/-]*$/).refine((value) => !value.includes(".."));
const storageKey = z.string().min(2).max(512).refine((value) =>
  !value.startsWith("/") && !value.includes("..") && !value.includes("\\") && !/^https?:\/\//i.test(value),
);
const objectSchema = z.record(z.string(), z.unknown());

const createAssetBody = z.object({
  assetKey,
  assetType,
  category: z.string().min(1).max(80),
  name: z.string().min(1).max(160),
  description: z.string().max(4000).default(""),
  storageKey,
  contentType: z.string().max(120).optional(),
  sizeBytes: z.number().int().positive().max(5_000_000_000).optional(),
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  metadata: objectSchema.default({}),
  validationReport: objectSchema.default({}),
}).strict();

const statusBody = z.object({
  status: z.enum(["review", "approved", "rejected", "archived"]),
}).strict();

assetsRouter.get("/catalog", async (req, res) => {
  const type = typeof req.query.type === "string" ? assetType.safeParse(req.query.type) : null;
  if (type && !type.success) { res.status(400).json({ error: "Loại asset không hợp lệ." }); return; }
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  if (category.length > 80) { res.status(400).json({ error: "category quá dài." }); return; }
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) { res.status(400).json({ error: "limit không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT a.id, a.asset_key, a.version, a.asset_type, a.category, a.name, a.description,
            a.storage_key, a.content_type, a.size_bytes, a.sha256, a.metadata, a.validation_report
       FROM world_asset_catalog a
      WHERE a.status = 'approved' AND a.is_current = true
        AND ($1::text IS NULL OR a.asset_type = $1)
        AND ($2 = '' OR a.category = $2)
      ORDER BY a.category, a.name
      LIMIT $3`,
    [type?.success ? type.data : null, category, limit],
  );
  res.json({ assets: result.rows });
});

assetsRouter.get("/catalog/:assetKey", async (req, res) => {
  const key = assetKey.safeParse(req.params.assetKey);
  if (!key.success) { res.status(400).json({ error: "assetKey không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT id, asset_key, version, asset_type, category, name, description,
            storage_key, content_type, size_bytes, sha256, metadata, validation_report
       FROM world_asset_catalog
      WHERE asset_key = $1 AND is_current = true AND status = 'approved'
      LIMIT 1`,
    [key.data],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy asset đã phát hành." }); return; }
  res.json({ asset: result.rows[0] });
});

adminAssetsRouter.use(requireAuth);

adminAssetsRouter.get("/", requirePermission("assets.read"), async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  const result = await pool.query(
    `SELECT a.*, u.username AS created_by_username
       FROM world_asset_catalog a
       LEFT JOIN users u ON u.id = a.created_by
      WHERE ($1 = '' OR a.status = $1)
      ORDER BY a.asset_key, a.version DESC
      LIMIT 200`,
    [status],
  );
  res.json({ assets: result.rows });
});

adminAssetsRouter.get("/:assetKey/versions", requirePermission("assets.read"), async (req, res) => {
  const key = assetKey.safeParse(req.params.assetKey);
  if (!key.success) { res.status(400).json({ error: "assetKey không hợp lệ." }); return; }
  const result = await pool.query(
    "SELECT * FROM world_asset_catalog WHERE asset_key = $1 ORDER BY version DESC",
    [key.data],
  );
  res.json({ versions: result.rows });
});

adminAssetsRouter.post("/", requirePermission("assets.write"), async (req, res) => {
  const body = createAssetBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dữ liệu asset không hợp lệ.", fields: body.error.flatten().fieldErrors }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [body.data.assetKey]);
    const versionResult = await client.query<{ version: number }>(
      "SELECT COALESCE(max(version), 0)::int + 1 AS version FROM world_asset_catalog WHERE asset_key = $1",
      [body.data.assetKey],
    );
    const inserted = await client.query(
      `INSERT INTO world_asset_catalog
        (asset_key, version, asset_type, category, name, description, storage_key, content_type,
         size_bytes, sha256, status, is_current, metadata, validation_report, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',false,$11::jsonb,$12::jsonb,$13)
       RETURNING *`
      [
        body.data.assetKey, versionResult.rows[0].version, body.data.assetType, body.data.category,
        body.data.name, body.data.description, body.data.storageKey, body.data.contentType ?? null,
        body.data.sizeBytes ?? null, body.data.sha256?.toLowerCase() ?? null,
        JSON.stringify(body.data.metadata), JSON.stringify(body.data.validationReport), req.auth!.sub,
      ],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'asset_version_created', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({ assetId: inserted.rows[0].id, assetKey: body.data.assetKey, version: versionResult.rows[0].version }), req.ip],
    );
    await client.query("COMMIT");
    res.status(201).json({ asset: inserted.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

adminAssetsRouter.patch("/:assetId/status", requirePermission("assets.publish"), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.assetId);
  const body = statusBody.safeParse(req.body);
  if (!id.success || !body.success) { res.status(400).json({ error: "Dữ liệu trạng thái asset không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ asset_key: string; sha256: string | null; size_bytes: string | null; validation_report: Record<string, unknown> }>(
      "SELECT asset_key, sha256, size_bytes, validation_report FROM world_asset_catalog WHERE id = $1 FOR UPDATE",
      [id.data],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy asset." });
      return;
    }
    if (body.data.status === "approved" &&
        (!current.rows[0].sha256 || !current.rows[0].size_bytes || current.rows[0].validation_report?.passed !== true)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Asset cần SHA-256, kích thước và validation_report.passed=true trước khi phát hành." });
      return;
    }
    if (body.data.status === "approved") {
      await client.query(
        "UPDATE world_asset_catalog SET is_current = false, updated_at = now() WHERE asset_key = $1 AND id <> $2 AND is_current = true",
        [current.rows[0].asset_key, id.data],
      );
    }
    const updated = await client.query(
      "UPDATE world_asset_catalog SET status = $2, is_current = CASE WHEN $2 = 'archived' THEN false WHEN $2 = 'approved' THEN true ELSE is_current END, updated_at = now() WHERE id = $1 RETURNING *",
      [id.data, body.data.status],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'asset_status_changed', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({ assetId: id.data, status: body.data.status }), req.ip],
    );
    await client.query("COMMIT");
    res.json({ asset: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});
