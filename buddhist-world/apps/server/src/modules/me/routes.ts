import { Router } from "express";
import { checkpointBody, profileBody, getRegion } from "@bw/shared";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";
import { isNearCheckpoint } from "./checkpoints.js";
import { getOwnedPresenceSnapshot, persistOwnedPresenceFence } from "./presence.js";

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.username, p.display_name, c.base_model, c.config AS character_config,
            l.region_id, l.spawn_id, l.x, l.y, l.z, l.yaw
       FROM users u
       JOIN player_profiles p ON p.user_id = u.id
       JOIN player_characters c ON c.user_id = u.id
       JOIN player_locations l ON l.user_id = u.id
      WHERE u.id = $1`, [req.auth!.sub]);
  if (!r.rows[0]) { res.status(404).json({ error: "Không tìm thấy hồ sơ." }); return; }
  res.json(r.rows[0]);
});

/** Chỉ chấp nhận checkpoint nằm trong manifest region – không tin tọa độ tùy ý từ client. */
meRouter.put("/profile", async (req, res) => {
  const p = profileBody.safeParse(req.body);
  if (!p.success) {
    res.status(400).json({ error: "Dữ liệu không hợp lệ", fields: p.error.flatten().fieldErrors });
    return;
  }

  const result = await pool.query(
    `UPDATE player_profiles
        SET display_name = $2, updated_at = now()
      WHERE user_id = $1
      RETURNING display_name`,
    [req.auth!.sub, p.data.displayName],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "Không tìm thấy hồ sơ." });
    return;
  }
  res.json({ displayName: result.rows[0].display_name });
});

/** Chỉ chấp nhận checkpoint nằm trong manifest region – không tin tọa độ tùy ý từ client. */
meRouter.put("/checkpoint", async (req, res) => {
  const p = checkpointBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ" }); return; }
  const region = getRegion(p.data.regionId);
  const spawn = region?.spawns.find((s) => s.id === p.data.spawnId);
  if (!region || !spawn) { res.status(400).json({ error: "Region hoặc điểm spawn không tồn tại." }); return; }

  // A valid manifest spawn is not sufficient: the caller must be online and
  // physically near the requested checkpoint according to fresh server presence.
  let snapshot: Awaited<ReturnType<typeof getOwnedPresenceSnapshot>>;
  try {
    snapshot = await getOwnedPresenceSnapshot(req.auth!.sub);
  } catch {
    res.status(503).json({ error: "Không thể xác minh vị trí hiện tại. Vui lòng thử lại." });
    return;
  }
  const presence = snapshot?.presence ?? {};
  const ownerEpoch = snapshot?.ownerEpoch ?? 0;
  const position = [Number(presence.x), Number(presence.y), Number(presence.z)] as [number, number, number];
  if (!snapshot || !presence.region ||
      !isNearCheckpoint(position, presence.region, region.id, spawn.position)) {
    res.status(409).json({ error: "Bạn cần ở gần điểm dừng và đang kết nối với thế giới để lưu checkpoint." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const fenced = snapshot ? await persistOwnedPresenceFence(client, req.auth!.sub, snapshot) : null;
    const sequence = Number(fenced?.presence.seq);
    if (!fenced || fenced.ownerEpoch !== ownerEpoch || !Number.isSafeInteger(sequence) || sequence < 0) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Phiên kết nối đã được thay thế. Vui lòng thử lại." });
      return;
    }
    const saved = await client.query(
      `UPDATE player_locations
          SET region_id = $2, spawn_id = $3, x = $4, y = $5, z = $6, yaw = $7,
              updated_at = now(), owner_epoch = $8, checkpoint_seq = $9
        WHERE user_id = $1
          AND (owner_epoch < $8 OR (owner_epoch = $8 AND checkpoint_seq < $9))
        RETURNING user_id`,
      [req.auth!.sub, region.id, spawn.id, ...spawn.position, spawn.yaw, ownerEpoch, sequence]);
    if (!saved.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Checkpoint cũ đã bị thay thế bởi trạng thái mới hơn." });
      return;
    }
    await client.query("COMMIT");
    res.status(204).end();
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
});
