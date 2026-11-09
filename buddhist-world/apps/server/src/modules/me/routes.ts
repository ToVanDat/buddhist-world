import { Router } from "express";
import { checkpointBody, profileBody, getRegion } from "@bw/shared";
import { pool } from "../../db/pool.js";
import { redis } from "../../lib/redis.js";
import { requireAuth } from "../auth/requireAuth.js";
import { isNearCheckpoint } from "./checkpoints.js";

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
  let presence: Record<string, string>;
  try {
    presence = await redis.hgetall(`presence:${req.auth!.sub}`);
  } catch {
    res.status(503).json({ error: "Không thể xác minh vị trí hiện tại. Vui lòng thử lại." });
    return;
  }
  const position = [Number(presence.x), Number(presence.y), Number(presence.z)] as [number, number, number];
  const heartbeatAt = Number(presence.heartbeatAt);
  const age = Date.now() - heartbeatAt;
  if (!presence.region || !Number.isFinite(heartbeatAt) || age < -5_000 || age > 30_000 ||
      !isNearCheckpoint(position, presence.region, region.id, spawn.position)) {
    res.status(409).json({ error: "Bạn cần ở gần điểm dừng và đang kết nối với thế giới để lưu checkpoint." });
    return;
  }

  await pool.query(
    `INSERT INTO player_locations (user_id, region_id, spawn_id, x, y, z, yaw)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id) DO UPDATE SET
       region_id = EXCLUDED.region_id,
       spawn_id = EXCLUDED.spawn_id,
       x = EXCLUDED.x,
       y = EXCLUDED.y,
       z = EXCLUDED.z,
       yaw = EXCLUDED.yaw,
       updated_at = now()`,
    [req.auth!.sub, region.id, spawn.id, ...spawn.position, spawn.yaw]);
  res.status(204).end();
});
