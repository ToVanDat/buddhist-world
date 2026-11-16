import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { SOCKET_EVENTS as E } from "@bw/shared";
import { emitToUser } from "../../realtime/publisher.js";
import { addNotification } from "../notifications/service.js";
import { pool } from "../../db/pool.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { requireAuth } from "../auth/requireAuth.js";
import { logger } from "../../lib/logger.js";
import { reconcilePartyVoiceMembership } from "../voice/livekit.js";

export const partiesRouter = Router();
partiesRouter.use(requireAuth);

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const activityTypes = ["meditation", "dharma_talk", "ceremony", "guided_tour", "world_visit"] as const;
const createPartyBody = z.object({
  activityType: z.enum(activityTypes),
  regionId: z.string().trim().min(1).max(80).optional(),
  maxMembers: z.number().int().min(2).max(16).default(6),
});
const inviteBody = z.object({ userId: uuid });
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

async function lockParty(client: PoolClient, partyId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`party:${partyId}`]);
}

async function activePartyMemberIds(client: PoolClient, partyId: string) {
  const result = await client.query<{ user_id: string }>(
    "SELECT user_id FROM player_party_members WHERE party_id = $1 AND left_at IS NULL",
    [partyId],
  );
  return result.rows.map((row) => row.user_id);
}

function emitPartyUpdated(memberIds: string[], payload: Record<string, unknown>) {
  for (const memberId of memberIds) emitToUser(memberId, E.serverPartyUpdated, payload);
  const partyId = typeof payload.partyId === "string" ? payload.partyId : null;
  if (!partyId) return;
  // Use the committed membership set, not the notification list (which can include a leaver).
  void pool.query<{ user_id: string }>(
    `SELECT m.user_id FROM player_party_members m
       JOIN player_parties p ON p.id = m.party_id
      WHERE m.party_id = $1 AND m.left_at IS NULL AND p.status <> 'closed'`,
    [partyId],
  ).then(({ rows }) => reconcilePartyVoiceMembership(partyId, rows.map((row) => row.user_id)))
    .catch((error) => logger.warn({ error, partyId }, "Party voice membership reconciliation failed"));
}

async function hasBlock(client: PoolClient, first: string, second: string) {
  const result = await client.query(
    `SELECT 1 FROM player_blocks WHERE unblocked_at IS NULL
      AND ((blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)) LIMIT 1`,
    [first, second],
  );
  return result.rowCount === 1;
}

partiesRouter.get("/", async (req, res) => {
  const page = pageSchema.safeParse(req.query);
  if (!page.success) { res.status(400).json({ error: "Tham số phân trang không hợp lệ." }); return; }
  const activity = typeof req.query.activityType === "string" ? req.query.activityType : null;
  if (activity && !activityTypes.includes(activity as typeof activityTypes[number])) {
    res.status(400).json({ error: "Loại hoạt động không hợp lệ." }); return;
  }
  const regionId = typeof req.query.regionId === "string" ? req.query.regionId.trim() : null;
  if (regionId && regionId.length > 80) { res.status(400).json({ error: "regionId quá dài." }); return; }
  const result = await pool.query(
    `SELECT p.id, p.leader_id, u.username AS leader_username, p.activity_type, p.region_id,
            p.status, p.max_members, p.created_at,
            count(m.user_id)::int AS member_count
       FROM player_parties p
       JOIN users u ON u.id = p.leader_id
       LEFT JOIN player_party_members m ON m.party_id = p.id AND m.left_at IS NULL
      WHERE p.status = 'open'
        AND ($1::text IS NULL OR p.activity_type = $1)
        AND ($2::text IS NULL OR p.region_id = $2)
      GROUP BY p.id, u.username
      ORDER BY p.created_at DESC
      LIMIT $3 OFFSET $4`,
    [activity, regionId || null, page.data.limit, page.data.offset],
  );
  res.json({ parties: result.rows, ...page.data });
});

partiesRouter.get("/mine", async (req, res) => {
  const result = await pool.query(
    `SELECT p.id, p.leader_id, p.activity_type, p.region_id, p.status, p.max_members,
            p.created_at, m.role, m.joined_at,
            (SELECT count(*)::int FROM player_party_members active
              WHERE active.party_id = p.id AND active.left_at IS NULL) AS member_count
       FROM player_party_members m
       JOIN player_parties p ON p.id = m.party_id
      WHERE m.user_id = $1 AND m.left_at IS NULL AND p.status <> 'closed'
      ORDER BY m.joined_at DESC LIMIT 10`,
    [req.auth!.sub],
  );
  res.json({ parties: result.rows });
});

partiesRouter.post("/", rateLimit("party-create", 5, 60), async (req, res) => {
  const parsed = createPartyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dữ liệu tạo Party không hợp lệ.", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      "SELECT party_id FROM player_party_members WHERE user_id = $1 AND left_at IS NULL FOR UPDATE",
      [req.auth!.sub],
    );
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Bạn đang ở trong một Party. Hãy rời Party hiện tại trước." });
      return;
    }
    const saved = await client.query(
      `INSERT INTO player_parties (leader_id, activity_type, region_id, max_members)
       VALUES ($1, $2, $3, $4) RETURNING id, leader_id, activity_type, region_id, status, max_members, created_at`,
      [req.auth!.sub, parsed.data.activityType, parsed.data.regionId ?? null, parsed.data.maxMembers],
    );
    await client.query(
      "INSERT INTO player_party_members (party_id, user_id, role) VALUES ($1, $2, 'leader')",
      [saved.rows[0].id, req.auth!.sub],
    );
    await client.query("COMMIT");
    res.status(201).json({ party: { ...saved.rows[0], member_count: 1 } });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Bạn đã tham gia một Party khác." });
      return;
    }
    throw error;
  } finally { client.release(); }
});

partiesRouter.get("/:partyId", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.partyId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã Party không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT p.id, p.leader_id, p.activity_type, p.region_id, p.status, p.max_members,
            p.created_at, p.updated_at,
            count(m.user_id)::int AS member_count,
            COALESCE(json_agg(json_build_object(
              'userId', u.id, 'username', u.username, 'role', m.role, 'joinedAt', m.joined_at
            ) ORDER BY m.joined_at) FILTER (WHERE m.user_id IS NOT NULL), '[]'::json) AS members
       FROM player_parties p
       LEFT JOIN player_party_members m ON m.party_id = p.id AND m.left_at IS NULL
       LEFT JOIN users u ON u.id = m.user_id
      WHERE p.id = $1
      GROUP BY p.id`,
    [parsedId.data],
  );
  if (!result.rows[0] || (result.rows[0].status === "closed" &&
      result.rows[0].leader_id !== req.auth!.sub)) {
    res.status(404).json({ error: "Không tìm thấy Party." }); return;
  }
  res.json({ party: result.rows[0] });
});

partiesRouter.post("/:partyId/join", rateLimit("party-join", 20, 60), async (req, res) => {
  const parsedId = uuid.safeParse(req.params.partyId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã Party không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockParty(client, parsedId.data);
    const party = await client.query(
      "SELECT id, status, max_members FROM player_parties WHERE id = $1 FOR UPDATE",
      [parsedId.data],
    );
    if (!party.rows[0] || party.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Party không còn mở để tham gia." }); return;
    }
    const current = await client.query(
      "SELECT 1 FROM player_party_members WHERE user_id = $1 AND left_at IS NULL",
      [req.auth!.sub],
    );
    if (current.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Bạn đang ở trong một Party khác hoặc đã là thành viên." }); return;
    }
    const count = await client.query(
      "SELECT count(*)::int AS count FROM player_party_members WHERE party_id = $1 AND left_at IS NULL",
      [parsedId.data],
    );
    if (count.rows[0].count >= party.rows[0].max_members) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Party đã đủ số lượng thành viên." }); return;
    }
    await client.query(
      `INSERT INTO player_party_members (party_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (party_id, user_id) DO UPDATE SET role = 'member', joined_at = now(), left_at = NULL`,
      [parsedId.data, req.auth!.sub],
    );
    const memberIds = await activePartyMemberIds(client, parsedId.data);
    await client.query("COMMIT");
    emitPartyUpdated(memberIds, { partyId: parsedId.data, status: "updated" });
    res.status(201).json({ partyId: parsedId.data, joined: true });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Bạn đã tham gia một Party khác." }); return;
    }
    throw error;
  } finally { client.release(); }
});

partiesRouter.post("/:partyId/invites", rateLimit("party-invite", 20, 60), async (req, res) => {
  const parsedId = uuid.safeParse(req.params.partyId);
  const body = inviteBody.safeParse(req.body);
  if (!parsedId.success || !body.success || body.data.userId === req.auth!.sub) {
    res.status(400).json({ error: "Dữ liệu lời mời không hợp lệ." }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockParty(client, parsedId.data);
    const party = await client.query(
      `SELECT p.id, p.status, p.max_members, p.activity_type, p.region_id FROM player_parties p
        JOIN player_party_members m ON m.party_id = p.id
       WHERE p.id = $1 AND m.user_id = $2 AND m.left_at IS NULL AND m.role = 'leader'
       FOR UPDATE OF p`,
      [parsedId.data, req.auth!.sub],
    );
    if (!party.rows[0] || party.rows[0].status !== "open") {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Chỉ trưởng nhóm của Party đang mở mới có thể mời." }); return;
    }
    const target = await client.query("SELECT id FROM users WHERE id = $1", [body.data.userId]);
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy người chơi." }); return;
    }
    if (await hasBlock(client, req.auth!.sub, body.data.userId)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Không thể mời người chơi đang có quan hệ chặn." }); return;
    }
    const already = await client.query(
      "SELECT 1 FROM player_party_members WHERE party_id = $1 AND user_id = $2 AND left_at IS NULL",
      [parsedId.data, body.data.userId],
    );
    if (already.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Người chơi đã ở trong Party." }); return;
    }
    const invite = await client.query(
      `INSERT INTO player_party_invites (party_id, inviter_id, invitee_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (party_id, invitee_id) WHERE status = 'pending'
       DO UPDATE SET created_at = now(), expires_at = now() + interval '15 minutes'
       RETURNING id, party_id, invitee_id, status, expires_at`,
      [parsedId.data, req.auth!.sub, body.data.userId],
    );
    const notified = await addNotification(client, {
      userId: body.data.userId,
      actorId: req.auth!.sub,
      kind: "system",
      payload: {
        type: "party_invite",
        message: "Bạn nhận được lời mời tham gia Party.",
        partyId: parsedId.data,
        inviteId: invite.rows[0].id,
        activityType: party.rows[0].activity_type,
        regionId: party.rows[0].region_id,
      },
      dedupeKey: `party-invite:${invite.rows[0].id}`,
    });
    await client.query("COMMIT");
    const inviteEvent = {
      inviteId: invite.rows[0].id, partyId: parsedId.data, inviterId: req.auth!.sub,
      activityType: party.rows[0].activity_type, regionId: party.rows[0].region_id,
    };
    emitToUser(body.data.userId, E.serverPartyInvite, inviteEvent);
    if (notified) emitToUser(body.data.userId, E.serverNotification, {
      kind: "system",
      payload: { type: "party_invite", message: "Bạn nhận được lời mời tham gia Party.", partyId: parsedId.data, inviteId: invite.rows[0].id },
    });
    res.status(201).json({ invite: invite.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

partiesRouter.get("/invites/inbox", async (req, res) => {
  const result = await pool.query(
    `SELECT i.id, i.party_id, i.inviter_id, u.username AS inviter_username,
            p.activity_type, p.region_id, i.created_at, i.expires_at
       FROM player_party_invites i
       JOIN users u ON u.id = i.inviter_id
       JOIN player_parties p ON p.id = i.party_id
      WHERE i.invitee_id = $1 AND i.status = 'pending' AND i.expires_at > now()
        AND p.status = 'open'
      ORDER BY i.created_at DESC LIMIT 50`,
    [req.auth!.sub],
  );
  res.json({ invites: result.rows });
});

partiesRouter.post("/invites/:inviteId/respond", async (req, res) => {
  const inviteId = uuid.safeParse(req.params.inviteId);
  const action = z.object({ action: z.enum(["accept", "decline"]) }).safeParse(req.body);
  if (!inviteId.success || !action.success) {
    res.status(400).json({ error: "Dữ liệu phản hồi lời mời không hợp lệ." }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identity = await client.query(
      "SELECT party_id FROM player_party_invites WHERE id = $1 AND invitee_id = $2",
      [inviteId.data, req.auth!.sub],
    );
    if (!identity.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy lời mời." }); return;
    }
    await lockParty(client, identity.rows[0].party_id);
    const invite = await client.query(
      `SELECT i.*, p.status AS party_status, p.max_members
         FROM player_party_invites i JOIN player_parties p ON p.id = i.party_id
        WHERE i.id = $1 AND i.invitee_id = $2 FOR UPDATE OF i, p`,
      [inviteId.data, req.auth!.sub],
    );
    if (!invite.rows[0] || invite.rows[0].status !== "pending" ||
        invite.rows[0].expires_at <= new Date() || invite.rows[0].party_status !== "open") {
      await client.query(
        "UPDATE player_party_invites SET status = 'expired', responded_at = now() WHERE id = $1 AND status = 'pending'",
        [inviteId.data],
      );
      await client.query("COMMIT");
      res.status(409).json({ error: "Lời mời đã hết hạn hoặc Party đã đóng." }); return;
    }
    if (action.data.action === "decline") {
      await client.query(
        "UPDATE player_party_invites SET status = 'declined', responded_at = now() WHERE id = $1",
        [inviteId.data],
      );
      const notified = await addNotification(client, {
        userId: invite.rows[0].inviter_id, actorId: req.auth!.sub, kind: "system",
        payload: { type: "party_invite_declined", message: "Lời mời Party của bạn đã bị từ chối.", partyId: invite.rows[0].party_id },
      });
      await client.query("COMMIT");
      if (notified) emitToUser(invite.rows[0].inviter_id, E.serverNotification, {
        kind: "system", payload: { type: "party_invite_declined", message: "Lời mời Party của bạn đã bị từ chối.", partyId: invite.rows[0].party_id },
      });
      res.json({ inviteId: inviteId.data, status: "declined" }); return;
    }
    const current = await client.query(
      "SELECT 1 FROM player_party_members WHERE user_id = $1 AND left_at IS NULL",
      [req.auth!.sub],
    );
    if (current.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Bạn đang ở trong một Party khác." }); return;
    }
    const count = await client.query(
      "SELECT count(*)::int AS count FROM player_party_members WHERE party_id = $1 AND left_at IS NULL",
      [invite.rows[0].party_id],
    );
    if (count.rows[0].count >= invite.rows[0].max_members) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Party đã đủ số lượng thành viên." }); return;
    }
    if (await hasBlock(client, req.auth!.sub, invite.rows[0].inviter_id)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Không thể tham gia Party do quan hệ chặn." }); return;
    }
    await client.query(
      `INSERT INTO player_party_members (party_id, user_id, role) VALUES ($1, $2, 'member')
       ON CONFLICT (party_id, user_id) DO UPDATE SET role = 'member', joined_at = now(), left_at = NULL`,
      [invite.rows[0].party_id, req.auth!.sub],
    );
    await client.query(
      "UPDATE player_party_invites SET status = 'accepted', responded_at = now() WHERE id = $1",
      [inviteId.data],
    );
    const notified = await addNotification(client, {
      userId: invite.rows[0].inviter_id, actorId: req.auth!.sub, kind: "system",
      payload: { type: "party_invite_accepted", message: "Lời mời Party của bạn đã được chấp nhận.", partyId: invite.rows[0].party_id },
    });
    const memberIds = await activePartyMemberIds(client, invite.rows[0].party_id);
    await client.query("COMMIT");
    if (notified) emitToUser(invite.rows[0].inviter_id, E.serverNotification, {
      kind: "system", payload: { type: "party_invite_accepted", message: "Lời mời Party của bạn đã được chấp nhận.", partyId: invite.rows[0].party_id },
    });
    emitPartyUpdated(memberIds, { partyId: invite.rows[0].party_id, status: "updated" });
    res.status(201).json({ partyId: invite.rows[0].party_id, joined: true });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Bạn đã tham gia một Party khác." }); return;
    }
    throw error;
  } finally { client.release(); }
});

partiesRouter.post("/:partyId/leave", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.partyId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã Party không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockParty(client, parsedId.data);
    const party = await client.query(
      "SELECT id, leader_id, status FROM player_parties WHERE id = $1 FOR UPDATE",
      [parsedId.data],
    );
    if (!party.rows[0] || party.rows[0].status === "closed") {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy Party đang hoạt động." }); return;
    }
    const member = await client.query(
      "UPDATE player_party_members SET left_at = now() WHERE party_id = $1 AND user_id = $2 AND left_at IS NULL RETURNING role",
      [parsedId.data, req.auth!.sub],
    );
    if (!member.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Bạn không phải thành viên Party." }); return;
    }
    if (member.rows[0].role === "leader") {
      const successor = await client.query(
        `SELECT user_id FROM player_party_members WHERE party_id = $1 AND left_at IS NULL
          ORDER BY joined_at, user_id LIMIT 1 FOR UPDATE`,
        [parsedId.data],
      );
      if (successor.rows[0]) {
        await client.query(
          "UPDATE player_party_members SET role = 'leader' WHERE party_id = $1 AND user_id = $2",
          [parsedId.data, successor.rows[0].user_id],
        );
        await client.query(
          "UPDATE player_parties SET leader_id = $2, updated_at = now() WHERE id = $1",
          [parsedId.data, successor.rows[0].user_id],
        );
      } else {
        await client.query(
          "UPDATE player_parties SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = $1",
          [parsedId.data],
        );
      }
    }
    const memberIds = await activePartyMemberIds(client, parsedId.data);
    await client.query("COMMIT");
    emitPartyUpdated([...new Set([...memberIds, req.auth!.sub])], { partyId: parsedId.data, status: "updated" });
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

partiesRouter.post("/:partyId/close", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.partyId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã Party không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockParty(client, parsedId.data);
    const result = await client.query(
      `UPDATE player_parties SET status = 'closed', closed_at = now(), updated_at = now()
        WHERE id = $1 AND leader_id = $2 AND status <> 'closed' RETURNING id`,
      [parsedId.data, req.auth!.sub],
    );
    if (!result.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy Party hoặc bạn không phải trưởng nhóm." });
      return;
    }
    const memberIds = await activePartyMemberIds(client, parsedId.data);
    await client.query(
      "UPDATE player_party_members SET left_at = now() WHERE party_id = $1 AND left_at IS NULL",
      [parsedId.data],
    );
    await client.query(
      "UPDATE player_party_invites SET status = 'cancelled', responded_at = now() WHERE party_id = $1 AND status = 'pending'",
      [parsedId.data],
    );
    await client.query("COMMIT");
    emitPartyUpdated(memberIds, { partyId: parsedId.data, status: "closed" });
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});
