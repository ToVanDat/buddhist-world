import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { SOCKET_EVENTS as E } from "@bw/shared";
import { emitToUser } from "../../realtime/publisher.js";
import { addNotification } from "../notifications/service.js";
import { pool } from "../../db/pool.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { requireAuth } from "../auth/requireAuth.js";
import { canViewCommunityDetails } from "./access.js";

export const communitiesRouter = Router();
communitiesRouter.use(requireAuth);

const uuid = z.string().uuid().transform((v) => v.toLowerCase());
const purposes = ["meditation", "dharma_learning", "temple_volunteering", "regional_community", "general"] as const;
const createBody = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(80),
  description: z.string().trim().max(2000).default(""),
  purpose: z.enum(purposes),
  visibility: z.enum(["public", "private"]).default("public"),
});
const page = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

async function lockGroup(client: PoolClient, groupId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`community:${groupId}`]);
}
async function activeCommunityMemberIds(client: PoolClient, groupId: string) {
  const result = await client.query<{ user_id: string }>(
    "SELECT user_id FROM community_group_members WHERE group_id = $1 AND status = 'active'",
    [groupId],
  );
  return result.rows.map((row) => row.user_id);
}

function emitCommunityUpdated(memberIds: string[], payload: Record<string, unknown>) {
  for (const memberId of memberIds) emitToUser(memberId, E.serverCommunityUpdated, payload);
}

async function managerRole(client: PoolClient, groupId: string, userId: string) {
  const result = await client.query(
    `SELECT role FROM community_group_members
      WHERE group_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner', 'moderator')`,
    [groupId, userId],
  );
  return result.rows[0]?.role as "owner" | "moderator" | undefined;
}

communitiesRouter.get("/", async (req, res) => {
  const paging = page.safeParse(req.query);
  if (!paging.success) { res.status(400).json({ error: "Tham số phân trang không hợp lệ." }); return; }
  const purpose = typeof req.query.purpose === "string" ? req.query.purpose : null;
  if (purpose && !purposes.includes(purpose as typeof purposes[number])) {
    res.status(400).json({ error: "Mục đích cộng đồng không hợp lệ." }); return;
  }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length > 80) { res.status(400).json({ error: "Từ khóa quá dài." }); return; }
  const result = await pool.query(
    `SELECT g.id, g.name, g.slug, g.description, g.purpose, g.visibility, g.created_at,
            count(m.user_id)::int AS member_count
       FROM community_groups g
       LEFT JOIN community_group_members m ON m.group_id = g.id AND m.status = 'active'
      WHERE g.status = 'active' AND g.visibility = 'public'
        AND ($1::text IS NULL OR g.purpose = $1)
        AND ($2 = '' OR g.name ILIKE $3 OR g.description ILIKE $3)
      GROUP BY g.id ORDER BY member_count DESC, g.created_at DESC
      LIMIT $4 OFFSET $5`,
    [purpose, q, `%${q}%`, paging.data.limit, paging.data.offset],
  );
  res.json({ communities: result.rows, ...paging.data });
});

communitiesRouter.get("/mine", async (req, res) => {
  const result = await pool.query(
    `SELECT g.id, g.name, g.slug, g.description, g.purpose, g.visibility, g.status,
            m.role, m.joined_at,
            (SELECT count(*)::int FROM community_group_members x
              WHERE x.group_id = g.id AND x.status = 'active') AS member_count
       FROM community_group_members m JOIN community_groups g ON g.id = m.group_id
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY m.joined_at DESC LIMIT 100`,
    [req.auth!.sub],
  );
  res.json({ communities: result.rows });
});

communitiesRouter.post("/", rateLimit("community-create", 3, 3600), async (req, res) => {
  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dữ liệu tạo cộng đồng không hợp lệ.", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const saved = await client.query(
      `INSERT INTO community_groups (owner_id, name, slug, description, purpose, visibility)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, slug, description, purpose, visibility, status, created_at`,
      [req.auth!.sub, parsed.data.name, parsed.data.slug, parsed.data.description,
        parsed.data.purpose, parsed.data.visibility],
    );
    await client.query(
      `INSERT INTO community_group_members (group_id, user_id, role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [saved.rows[0].id, req.auth!.sub],
    );
    await client.query("COMMIT");
    res.status(201).json({ community: { ...saved.rows[0], role: "owner", member_count: 1 } });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Đường dẫn cộng đồng đã được sử dụng." }); return;
    }
    throw error;
  } finally { client.release(); }
});

communitiesRouter.get("/:groupId", async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  if (!groupId.success) { res.status(400).json({ error: "Mã cộng đồng không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT g.id, g.owner_id, g.name, g.slug, g.description, g.purpose, g.visibility,
            g.status, g.created_at, count(m.user_id)::int AS member_count,
            mine.role AS my_role, mine.status AS my_membership_status
       FROM community_groups g
       LEFT JOIN community_group_members m ON m.group_id = g.id AND m.status = 'active'
       LEFT JOIN community_group_members mine ON mine.group_id = g.id AND mine.user_id = $2
      WHERE g.id = $1
      GROUP BY g.id, mine.role, mine.status`,
    [groupId.data, req.auth!.sub],
  );
  const group = result.rows[0];
  if (!group || group.status !== "active" ||
      !canViewCommunityDetails(group.visibility, group.my_membership_status)) {
    res.status(404).json({ error: "Không tìm thấy cộng đồng." }); return;
  }
  const members = await pool.query(
    `SELECT u.id AS user_id, u.username, m.role, m.joined_at
       FROM community_group_members m JOIN users u ON u.id = m.user_id
      WHERE m.group_id = $1 AND m.status = 'active'
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'moderator' THEN 1 ELSE 2 END, m.joined_at
      LIMIT 100`,
    [groupId.data],
  );
  res.json({ community: group, members: members.rows });
});

communitiesRouter.post("/:groupId/join", rateLimit("community-join", 20, 60), async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  if (!groupId.success) { res.status(400).json({ error: "Mã cộng đồng không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockGroup(client, groupId.data);
    const group = await client.query(
      "SELECT id, visibility, status FROM community_groups WHERE id = $1 FOR UPDATE",
      [groupId.data],
    );
    if (!group.rows[0] || group.rows[0].status !== "active") {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Cộng đồng không còn hoạt động." }); return;
    }
    const membership = await client.query(
      "SELECT status FROM community_group_members WHERE group_id = $1 AND user_id = $2 FOR UPDATE",
      [groupId.data, req.auth!.sub],
    );
    if (membership.rows[0]?.status === "banned" || membership.rows[0]?.status === "removed") {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Bạn không thể tham gia cộng đồng này." }); return;
    }
    if (membership.rows[0]?.status === "active") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Bạn đã là thành viên cộng đồng." }); return;
    }
    if (group.rows[0].visibility === "public") {
      await client.query(
        `INSERT INTO community_group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT (group_id, user_id)
         DO UPDATE SET status = 'active', role = 'member', joined_at = now(), updated_at = now()`,
        [groupId.data, req.auth!.sub],
      );
      const memberIds = await activeCommunityMemberIds(client, groupId.data);
      await client.query("COMMIT");
      emitCommunityUpdated(memberIds, { groupId: groupId.data, status: "updated" });
      res.status(201).json({ groupId: groupId.data, status: "joined" }); return;
    }
    const request = await client.query(
      `INSERT INTO community_group_join_requests (group_id, user_id)
       VALUES ($1, $2) RETURNING id, status, created_at`,
      [groupId.data, req.auth!.sub],
    );
    const managers = await client.query<{ user_id: string }>(
      "SELECT user_id FROM community_group_members WHERE group_id = $1 AND status = 'active' AND role IN ('owner', 'moderator')",
      [groupId.data],
    );
    const notifiedManagers: string[] = [];
    for (const manager of managers.rows) {
      const notified = await addNotification(client, {
        userId: manager.user_id, actorId: req.auth!.sub, kind: "system",
        payload: { type: "community_join_request", message: "Có yêu cầu tham gia cộng đồng cần duyệt.", groupId: groupId.data, requestId: request.rows[0].id },
        dedupeKey: `community-join-request:${request.rows[0].id}:${manager.user_id}`,
      });
      if (notified) notifiedManagers.push(manager.user_id);
    }
    await client.query("COMMIT");
    for (const managerId of notifiedManagers) emitToUser(managerId, E.serverNotification, {
      kind: "system", payload: { type: "community_join_request", message: "Có yêu cầu tham gia cộng đồng cần duyệt.", groupId: groupId.data, requestId: request.rows[0].id },
    });
    res.status(202).json({ groupId: groupId.data, joinRequest: request.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Bạn đã gửi yêu cầu tham gia đang chờ." }); return;
    }
    throw error;
  } finally { client.release(); }
});

communitiesRouter.post("/:groupId/leave", async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  if (!groupId.success) { res.status(400).json({ error: "Mã cộng đồng không hợp lệ." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockGroup(client, groupId.data);
    const membership = await client.query(
      `SELECT role FROM community_group_members
        WHERE group_id = $1 AND user_id = $2 AND status = 'active' FOR UPDATE`,
      [groupId.data, req.auth!.sub],
    );
    if (!membership.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Bạn không phải thành viên đang hoạt động." }); return;
    }
    if (membership.rows[0].role === "owner") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Chủ cộng đồng cần chuyển quyền sở hữu hoặc lưu trữ cộng đồng trước khi rời." }); return;
    }
    await client.query(
      "UPDATE community_group_members SET status = 'left', updated_at = now() WHERE group_id = $1 AND user_id = $2",
      [groupId.data, req.auth!.sub],
    );
    const memberIds = await activeCommunityMemberIds(client, groupId.data);
    await client.query("COMMIT");
    emitCommunityUpdated([...new Set([...memberIds, req.auth!.sub])], { groupId: groupId.data, status: "updated" });
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

communitiesRouter.get("/:groupId/requests", async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  if (!groupId.success) { res.status(400).json({ error: "Mã cộng đồng không hợp lệ." }); return; }
  const role = await pool.query(
    `SELECT 1 FROM community_group_members
      WHERE group_id = $1 AND user_id = $2 AND status = 'active' AND role IN ('owner', 'moderator')`,
    [groupId.data, req.auth!.sub],
  );
  if (!role.rows[0]) { res.status(403).json({ error: "Bạn không có quyền duyệt yêu cầu." }); return; }
  const requests = await pool.query(
    `SELECT r.id, r.user_id, u.username, r.created_at
       FROM community_group_join_requests r JOIN users u ON u.id = r.user_id
      WHERE r.group_id = $1 AND r.status = 'pending'
      ORDER BY r.created_at LIMIT 100`,
    [groupId.data],
  );
  res.json({ requests: requests.rows });
});

communitiesRouter.post("/:groupId/requests/:requestId/review", async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  const requestId = uuid.safeParse(req.params.requestId);
  const body = z.object({ decision: z.enum(["approve", "decline"]) }).safeParse(req.body);
  if (!groupId.success || !requestId.success || !body.success) {
    res.status(400).json({ error: "Dữ liệu duyệt yêu cầu không hợp lệ." }); return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockGroup(client, groupId.data);
    const role = await managerRole(client, groupId.data, req.auth!.sub);
    if (!role) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Bạn không có quyền duyệt yêu cầu." }); return;
    }
    const request = await client.query(
      `SELECT id, user_id FROM community_group_join_requests
        WHERE id = $1 AND group_id = $2 AND status = 'pending' FOR UPDATE`,
      [requestId.data, groupId.data],
    );
    if (!request.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy yêu cầu đang chờ." }); return;
    }
    const status = body.data.decision === "approve" ? "approved" : "declined";
    if (status === "approved") {
      const existingMembership = await client.query<{ status: string }>(
        `SELECT status FROM community_group_members
          WHERE group_id = $1 AND user_id = $2 FOR UPDATE`,
        [groupId.data, request.rows[0].user_id],
      );
      if (["removed", "banned"].includes(existingMembership.rows[0]?.status ?? "")) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Thành viên này không đủ điều kiện tham gia lại cộng đồng." });
        return;
      }
    }
    await client.query(
      `UPDATE community_group_join_requests
          SET status = $2, reviewed_at = now(), reviewed_by = $3 WHERE id = $1`,
      [requestId.data, status, req.auth!.sub],
    );
    if (status === "approved") {
      await client.query(
        `INSERT INTO community_group_members (group_id, user_id, role, status)
         VALUES ($1, $2, 'member', 'active')
         ON CONFLICT (group_id, user_id)
         DO UPDATE SET status = 'active', role = 'member', joined_at = now(), updated_at = now()`,
        [groupId.data, request.rows[0].user_id],
      );
    }
    const message = status === "approved"
      ? "Yêu cầu tham gia cộng đồng của bạn đã được chấp nhận."
      : "Yêu cầu tham gia cộng đồng của bạn đã bị từ chối.";
    const notified = await addNotification(client, {
      userId: request.rows[0].user_id, actorId: req.auth!.sub, kind: "system",
      payload: { type: "community_join_review", message, groupId: groupId.data, requestId: requestId.data, status },
      dedupeKey: `community-join-review:${requestId.data}`,
    });
    const memberIds = status === "approved" ? await activeCommunityMemberIds(client, groupId.data) : [];
    await client.query("COMMIT");
    if (notified) emitToUser(request.rows[0].user_id, E.serverNotification, {
      kind: "system", payload: { type: "community_join_review", message, groupId: groupId.data, requestId: requestId.data, status },
    });
    if (status === "approved") emitCommunityUpdated(memberIds, { groupId: groupId.data, status: "updated" });
    res.json({ requestId: requestId.data, status });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});

communitiesRouter.patch("/:groupId", async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  const body = z.object({
    name: z.string().trim().min(3).max(80).optional(),
    description: z.string().trim().max(2000).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    status: z.enum(["active", "archived"]).optional(),
  }).strict().refine((v) => Object.keys(v).length > 0).safeParse(req.body);
  if (!groupId.success || !body.success) {
    res.status(400).json({ error: "Dữ liệu cập nhật cộng đồng không hợp lệ." }); return;
  }
  const result = await pool.query(
    `UPDATE community_groups g SET
        name = COALESCE($3, g.name), description = COALESCE($4, g.description),
        visibility = COALESCE($5, g.visibility), status = COALESCE($6, g.status), updated_at = now()
      WHERE g.id = $1 AND g.owner_id = $2 AND g.status <> 'suspended'
      RETURNING g.id, g.name, g.slug, g.description, g.purpose, g.visibility, g.status, g.updated_at`,
    [groupId.data, req.auth!.sub, body.data.name ?? null, body.data.description ?? null,
      body.data.visibility ?? null, body.data.status ?? null],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy cộng đồng hoặc bạn không phải chủ sở hữu." }); return; }
  const members = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM community_group_members WHERE group_id = $1 AND status = 'active'",
    [groupId.data],
  );
  emitCommunityUpdated(members.rows.map((row) => row.user_id), { groupId: groupId.data, status: result.rows[0].status });
  res.json({ community: result.rows[0] });
});

communitiesRouter.post("/:groupId/members/:userId/role", async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  const userId = uuid.safeParse(req.params.userId);
  const body = z.object({ role: z.enum(["moderator", "member"]) }).safeParse(req.body);
  if (!groupId.success || !userId.success || !body.success || userId.data === req.auth!.sub) {
    res.status(400).json({ error: "Dữ liệu phân quyền thành viên không hợp lệ." }); return;
  }
  const result = await pool.query(
    `UPDATE community_group_members target
        SET role = $4, updated_at = now()
       WHERE target.group_id = $1 AND target.user_id = $2 AND target.status = 'active'
         AND EXISTS (
           SELECT 1 FROM community_group_members actor
            WHERE actor.group_id = $1 AND actor.user_id = $3
              AND actor.status = 'active' AND actor.role = 'owner'
         )
         AND target.role <> 'owner'
       RETURNING target.user_id, target.role`,
    [groupId.data, userId.data, req.auth!.sub, body.data.role],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy thành viên hoặc bạn không phải chủ sở hữu." }); return; }
  const members = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM community_group_members WHERE group_id = $1 AND status = 'active'",
    [groupId.data],
  );
  emitCommunityUpdated(members.rows.map((row) => row.user_id), { groupId: groupId.data, status: "updated" });
  res.json({ member: result.rows[0] });
});

communitiesRouter.delete("/:groupId/members/:userId", async (req, res) => {
  const groupId = uuid.safeParse(req.params.groupId);
  const userId = uuid.safeParse(req.params.userId);
  if (!groupId.success || !userId.success || userId.data === req.auth!.sub) {
    res.status(400).json({ error: "Mã thành viên không hợp lệ." }); return;
  }
  const result = await pool.query(
    `UPDATE community_group_members target
        SET status = 'removed', updated_at = now()
       WHERE target.group_id = $1 AND target.user_id = $2 AND target.status = 'active'
         AND target.role <> 'owner'
         AND EXISTS (
           SELECT 1 FROM community_group_members actor
            WHERE actor.group_id = $1 AND actor.user_id = $3
              AND actor.status = 'active'
              AND (actor.role = 'owner' OR (actor.role = 'moderator' AND target.role = 'member'))
         )
       RETURNING target.user_id`,
    [groupId.data, userId.data, req.auth!.sub],
  );
  if (!result.rows[0]) { res.status(404).json({ error: "Không tìm thấy thành viên hoặc bạn không có quyền xóa." }); return; }
  const members = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM community_group_members WHERE group_id = $1 AND status = 'active'",
    [groupId.data],
  );
  emitCommunityUpdated([...members.rows.map((row) => row.user_id), result.rows[0].user_id], { groupId: groupId.data, status: "updated" });
  res.status(204).end();
});
