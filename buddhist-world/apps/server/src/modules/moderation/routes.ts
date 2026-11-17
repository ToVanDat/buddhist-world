import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireTables } from "../../db/requireTables.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { logger } from "../../lib/logger.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requirePermission } from "../auth/requirePermission.js";
import { redis } from "../../lib/redis.js";
import { applyLiveVoicePermission, voiceMuteKey } from "./voice.js";

export const moderationRouter = Router();
export const adminModerationRouter = Router();

moderationRouter.use(requireAuth, requireTables("player_reports"));
adminModerationRouter.use(
  requireAuth,
  requireTables("player_reports", "admin_permissions", "admin_role_permissions", "admin_user_permission_overrides"),
  requirePermission("moderation.manage"),
);

const reportBody = z.object({
  reportedUserId: z.string().uuid(),
  category: z.enum(["harassment", "spam", "disruptive_voice", "impersonation", "inappropriate_content", "other"]),
  details: z.string().trim().min(10).max(2000),
}).strict();

moderationRouter.post("/reports", rateLimit("player-report", 5, 3600), async (req, res) => {
  const body = reportBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Nội dung báo cáo không hợp lệ.", fields: body.error.flatten().fieldErrors });
    return;
  }
  const reporterId = req.auth!.sub;
  const targetId = body.data.reportedUserId.toLowerCase();
  if (reporterId === targetId) { res.status(400).json({ error: "Bạn không thể báo cáo chính mình." }); return; }
  const target = await pool.query("SELECT id FROM users WHERE id = $1", [targetId]);
  if (!target.rowCount) { res.status(404).json({ error: "Không tìm thấy người chơi được báo cáo." }); return; }
  const result = await pool.query(
    `INSERT INTO player_reports (reporter_id, reported_user_id, category, details)
     VALUES ($1,$2,$3,$4)
     RETURNING id, reported_user_id, category, status, created_at`,
    [reporterId, targetId, body.data.category, body.data.details],
  );
  res.status(201).json({ report: result.rows[0] });
});

moderationRouter.get("/reports/mine", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 30;
  const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    res.status(400).json({ error: "Phân trang không hợp lệ." }); return;
  }
  const result = await pool.query(
    `SELECT id, reported_user_id, category, details, status, resolution_note, created_at, updated_at, resolved_at
       FROM player_reports WHERE reporter_id = $1
      ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [req.auth!.sub, limit, offset],
  );
  res.json({ reports: result.rows, limit, offset });
});

adminModerationRouter.get("/reports", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "";
  if (status && !["pending", "in_review", "resolved", "dismissed"].includes(status)) {
    res.status(400).json({ error: "Trạng thái báo cáo không hợp lệ." }); return;
  }
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    res.status(400).json({ error: "Phân trang không hợp lệ." }); return;
  }
  const result = await pool.query(
    `SELECT r.id, r.reporter_id, reporter.username AS reporter_username,
            r.reported_user_id, reported.username AS reported_username,
            r.category, r.details, r.status, r.reviewed_by,
            reviewer.username AS reviewer_username, r.resolution_note,
            r.created_at, r.updated_at, r.resolved_at
       FROM player_reports r
       JOIN users reporter ON reporter.id = r.reporter_id
       JOIN users reported ON reported.id = r.reported_user_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
      WHERE ($1 = '' OR r.status = $1)
      ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'in_review' THEN 1 ELSE 2 END,
               r.created_at ASC
      LIMIT $2 OFFSET $3`,
    [status, limit, offset],
  );
  res.json({ reports: result.rows, limit, offset });
});

adminModerationRouter.patch("/reports/:reportId", async (req, res) => {
  const reportId = z.string().uuid().safeParse(req.params.reportId);
  const body = z.object({
    status: z.enum(["in_review", "resolved", "dismissed"]),
    resolutionNote: z.string().trim().max(2000).default(""),
  }).strict().safeParse(req.body);
  if (!reportId.success || !body.success) {
    res.status(400).json({ error: "Dữ liệu xử lý báo cáo không hợp lệ." }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ status: string }>(
      "SELECT status FROM player_reports WHERE id = $1 FOR UPDATE",
      [reportId.data],
    );
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy báo cáo." });
      return;
    }
    if (current.rows[0].status === "resolved" || current.rows[0].status === "dismissed") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Báo cáo đã được đóng, không thể thay đổi trạng thái." });
      return;
    }
    const resolved = body.data.status === "resolved" || body.data.status === "dismissed";
    const updated = await client.query(
      `UPDATE player_reports
          SET status = $2, reviewed_by = $3, resolution_note = $4,
              resolved_at = CASE WHEN $5 THEN now() ELSE NULL END, updated_at = now()
        WHERE id = $1
        RETURNING id, status, reviewed_by, resolution_note, updated_at, resolved_at`,
      [reportId.data, body.data.status, req.auth!.sub, body.data.resolutionNote, resolved],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'player_report_reviewed', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({ reportId: reportId.data, ...updated.rows[0] }), req.ip],
    );
    await client.query("COMMIT");
    res.json({ report: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

const voiceMuteBody = z.object({
  durationSeconds: z.number().int().min(60).max(86_400),
  reason: z.string().trim().min(5).max(500),
}).strict();

adminModerationRouter.post("/players/:userId/voice-mute", async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  const body = voiceMuteBody.safeParse(req.body);
  if (!userId.success || !body.success) {
    res.status(400).json({ error: "Thông tin voice mute không hợp lệ." }); return;
  }
  const target = await pool.query("SELECT id FROM users WHERE id = $1", [userId.data]);
  if (!target.rowCount) { res.status(404).json({ error: "Không tìm thấy người chơi." }); return; }
  await redis.set(voiceMuteKey(userId.data), body.data.reason, "EX", body.data.durationSeconds);
  let live: Awaited<ReturnType<typeof applyLiveVoicePermission>>;
  try {
    live = await applyLiveVoicePermission(userId.data, true);
  } catch (error) {
    // Keep the Redis mute key: token issuance remains fail-closed while the
    // already-connected participant still requires a successful SFU revoke.
    logger.error({ error, targetUserId: userId.data, adminUserId: req.auth!.sub }, "LiveKit voice mute enforcement failed");
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'player_voice_mute_enforcement_failed', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({
        targetUserId: userId.data, durationSeconds: body.data.durationSeconds,
        reason: body.data.reason, redisMuteStored: true,
      }), req.ip],
    );
    res.status(503).json({
      muted: true,
      liveKitEnforced: false,
      code: "VOICE_MUTE_ENFORCEMENT_FAILED",
      error: "Đã khóa quyền cấp token voice mới, nhưng chưa xác nhận thu hồi phiên voice đang hoạt động. Vui lòng thử lại.",
    });
    return;
  }
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, detail, ip)
     VALUES ($1, 'player_voice_muted', $2::jsonb, $3)`,
    [req.auth!.sub, JSON.stringify({
      targetUserId: userId.data, durationSeconds: body.data.durationSeconds,
      reason: body.data.reason, activeRoomsUpdated: live.activeRooms,
      enforcementWarnings: live.enforcementWarnings,
    }), req.ip],
  );
  res.json({
    muted: true,
    expiresInSeconds: body.data.durationSeconds,
    activeRoomsUpdated: live.activeRooms,
    liveKitConfigured: live.configured,
    enforcementWarnings: live.enforcementWarnings,
  });
});

adminModerationRouter.post("/players/:userId/voice-unmute", async (req, res) => {
  const userId = z.string().uuid().safeParse(req.params.userId);
  if (!userId.success) { res.status(400).json({ error: "userId không hợp lệ." }); return; }
  const target = await pool.query("SELECT id FROM users WHERE id = $1", [userId.data]);
  if (!target.rowCount) { res.status(404).json({ error: "Không tìm thấy người chơi." }); return; }
  // Keep the Redis deny-token flag until the SFU permission update succeeds.
  // If LiveKit is unavailable, applyLiveVoicePermission returns configured=false
  // and no active SFU session can be verified through this service.
  const live = await applyLiveVoicePermission(userId.data, false);
  await redis.del(voiceMuteKey(userId.data));
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, detail, ip)
     VALUES ($1, 'player_voice_unmuted', $2::jsonb, $3)`,
    [req.auth!.sub, JSON.stringify({ targetUserId: userId.data, activeRoomsUpdated: live.activeRooms }), req.ip],
  );
  res.json({ muted: false, activeRoomsUpdated: live.activeRooms, liveKitConfigured: live.configured });
});
