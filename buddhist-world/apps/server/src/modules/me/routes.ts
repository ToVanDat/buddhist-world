import { Router } from "express";
import { checkpointBody, getRegion } from "@bw/shared";
import { pool } from "../../db/pool.js";
import { requireAuth } from "../auth/requireAuth.js";

export const meRouter = Router();
meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const r = await pool.query(
    `SELECT u.id, u.username, p.display_name, c.base_model, c.config AS character_config,
            l.region_id, l.spawn_id, l.x, l.y, l.z
       FROM users u
       JOIN player_profiles p ON p.user_id = u.id
       JOIN player_characters c ON c.user_id = u.id
       JOIN player_locations l ON l.user_id = u.id
      WHERE u.id = $1`, [req.auth!.sub]);
  if (!r.rows[0]) { res.status(404).json({ error: "Không tìm thấy hồ sơ." }); return; }
  res.json(r.rows[0]);
});

/** Chỉ chấp nhận checkpoint nằm trong manifest region – không tin tọa độ tùy ý từ client. */
meRouter.put("/checkpoint", async (req, res) => {
  const p = checkpointBody.safeParse(req.body);
  if (!p.success) { res.status(400).json({ error: "Dữ liệu không hợp lệ" }); return; }
  const region = getRegion(p.data.regionId);
  const spawn = region?.spawns.find((s) => s.id === p.data.spawnId);
  if (!region || !spawn) { res.status(400).json({ error: "Region hoặc điểm spawn không tồn tại." }); return; }
  await pool.query(
    `INSERT INTO player_locations (user_id, region_id, spawn_id, x, y, z)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       region_id = EXCLUDED.region_id,
       spawn_id = EXCLUDED.spawn_id,
       x = EXCLUDED.x,
       y = EXCLUDED.y,
       z = EXCLUDED.z,
       updated_at = now()`,
    [req.auth!.sub, region.id, spawn.id, ...spawn.position]);
  res.status(204).end();
});
