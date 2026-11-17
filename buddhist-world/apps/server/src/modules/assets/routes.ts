import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireTables } from "../../db/requireTables.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requirePermission } from "../auth/requirePermission.js";
import { assetKey, assetType, createAssetBodySchema, assetStatusBodySchema } from "./schemas.js";

export const assetsRouter = Router();
export const adminAssetsRouter = Router();

assetsRouter.use(requireAuth, requireTables("world_asset_catalog"));

assetsRouter.get("/catalog", async (req, res) => {
  const type = typeof req.query.type === "string" ? assetType.safeParse(req.query.type) : null;
  if (type && !type.success) { res.status(400).json({ error: "Loại asset không hợp lệ." }); return; }
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  if (category.length > 80) { res.status(400).json({ error: "category quá dài." }); return; }
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) { res.status(400).json({ error: "limit không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT a.id, a.asset_key, a.version, a.asset_type, a.category, a.name, a.description,
            a.storage_key, a.content_type, a.size_bytes, a.sha256, a.metadata
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
            storage_key, content_type, size_bytes, sha256, metadata
       FROM world_asset_catalog
      WHERE asset_key = $1 AND is_current = true AND status = 'approved'
      LIMIT 1`,
    [key.data],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy asset đã phát hành." }); return; }
  res.json({ asset: result.rows[0] });
});

adminAssetsRouter.use(requireAuth, requireTables("world_asset_catalog"));

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
  const body = createAssetBodySchema.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dữ liệu asset không hợp lệ.", fields: body.error.flatten().fieldErrors }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [body.data.assetKey]);
    const versionResult = await client.query<{ version: number }>(
      "SELECT COALESCE(max(version), 0)::int + 1 AS version FROM world_asset_catalog WHERE asset_key = $1",
      [body.data.assetKey],
    );
    const nextVersion = versionResult.rows[0]?.version;
    if (!nextVersion) throw new Error("Asset version could not be allocated.");
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO world_asset_catalog
        (asset_key, version, asset_type, category, name, description, storage_key, content_type,
         size_bytes, sha256, status, is_current, metadata, validation_report, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft',false,$11::jsonb,'{}'::jsonb,$12)
       RETURNING *`,
      [
        body.data.assetKey, nextVersion, body.data.assetType, body.data.category,
        body.data.name, body.data.description, body.data.storageKey, body.data.contentType ?? null,
        body.data.sizeBytes ?? null, body.data.sha256?.toLowerCase() ?? null,
        JSON.stringify(body.data.metadata), req.auth!.sub,
      ],
    );
    const insertedAsset = inserted.rows[0];
    if (!insertedAsset) throw new Error("Asset insert returned no row.");
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'asset_version_created', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({ assetId: insertedAsset.id, assetKey: body.data.assetKey, version: nextVersion }), req.ip],
    );
    await client.query("COMMIT");
    res.status(201).json({ asset: insertedAsset });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

adminAssetsRouter.patch("/:assetId/status", requirePermission("assets.publish"), async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.assetId);
  const body = assetStatusBodySchema.safeParse(req.body);
  if (!id.success || !body.success) { res.status(400).json({ error: "Dữ liệu trạng thái asset không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ asset_key: string }>(
      "SELECT asset_key FROM world_asset_catalog WHERE id = $1 FOR UPDATE",
      [id.data],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy asset." });
      return;
    }
    if (body.data.status === "approved") {
      // Fail closed until the server runs the GLB/content validators and stores a
      // server-issued attestation. A client-supplied validation report is not proof.
      await client.query("ROLLBACK");
      res.status(409).json({
        code: "ASSET_VALIDATOR_NOT_CONFIGURED",
        error: "Chưa thể phát hành asset: server-side validation và attestation chưa được cấu hình.",
      });
      return;
    }
    const updated = await client.query(
      "UPDATE world_asset_catalog SET status = $2, is_current = CASE WHEN $2 = 'archived' THEN false ELSE is_current END, updated_at = now() WHERE id = $1 RETURNING *",
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
