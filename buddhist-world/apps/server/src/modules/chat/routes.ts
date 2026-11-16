import { Router } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { requireAuth } from "../auth/requireAuth.js";
import { relationshipLockKey } from "../social/relationshipRules.js";

export const chatRouter = Router();
chatRouter.use(requireAuth);

const uuid = z.string().uuid().transform((value) => value.toLowerCase());
const directBody = z.object({ userId: uuid });
const groupBody = z.object({
  title: z.string().trim().min(2).max(60),
  memberIds: z.array(uuid).max(19).default([]),
});
const messageBody = z.object({
  body: z.string().trim().min(1).max(4000),
  clientMessageId: uuid.optional(),
});

function pageFromQuery(query: Record<string, unknown>) {
  const limit = typeof query.limit === "string" ? Number(query.limit) : 30;
  const offset = typeof query.offset === "string" ? Number(query.offset) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 100_000) return null;
  return { limit, offset };
}

async function lockPair(client: PoolClient, first: string, second: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    relationshipLockKey(first, second),
  ]);
}

async function areFriends(
  client: PoolClient,
  first: string,
  second: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM player_friend_requests
      WHERE status = 'accepted'
        AND ((requester_id = $1 AND recipient_id = $2)
          OR (requester_id = $2 AND recipient_id = $1))
      LIMIT 1`,
    [first, second],
  );
  return result.rowCount === 1;
}

async function isBlocked(
  client: PoolClient,
  first: string,
  second: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM player_blocks
      WHERE unblocked_at IS NULL
        AND ((blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1))
      LIMIT 1`,
    [first, second],
  );
  return result.rowCount === 1;
}

async function isActiveMember(
  client: PoolClient,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM player_conversation_members
      WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [conversationId, userId],
  );
  return result.rowCount === 1;
}

chatRouter.get("/conversations", async (req, res) => {
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT c.id, c.kind, c.title, c.created_at, c.updated_at,
            (SELECT jsonb_agg(jsonb_build_object(
               'id', u.id, 'username', u.username, 'displayName', p.display_name, 'role', cm.role
             ) ORDER BY cm.joined_at, u.id)
               FROM player_conversation_members cm
               JOIN users u ON u.id = cm.user_id
               LEFT JOIN player_profiles p ON p.user_id = u.id
              WHERE cm.conversation_id = c.id AND cm.left_at IS NULL) AS members,
            (SELECT jsonb_build_object(
               'id', m.id, 'senderId', m.sender_id,
               'body', CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END,
               'deleted', m.deleted_at IS NOT NULL, 'createdAt', m.created_at
             )
               FROM player_messages m
              WHERE m.conversation_id = c.id
              ORDER BY m.created_at DESC, m.id DESC
              LIMIT 1) AS last_message,
            (SELECT count(*)::int
               FROM player_messages m
               LEFT JOIN player_message_receipts r
                 ON r.message_id = m.id AND r.user_id = $1
              WHERE m.conversation_id = c.id
                AND m.sender_id IS DISTINCT FROM $1
                AND m.deleted_at IS NULL
                AND r.read_at IS NULL) AS unread_count
       FROM player_conversation_members mine
       JOIN player_conversations c ON c.id = mine.conversation_id
      WHERE mine.user_id = $1 AND mine.left_at IS NULL
      ORDER BY c.updated_at DESC, c.id
      LIMIT $2 OFFSET $3`,
    [req.auth!.sub, page.limit, page.offset],
  );
  res.json({ conversations: result.rows, limit: page.limit, offset: page.offset });
});

chatRouter.post("/direct", rateLimit("chat-create-direct", 20, 60), async (req, res) => {
  const parsed = directBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dữ liệu không hợp lệ.", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const actorId = req.auth!.sub;
  const targetId = parsed.data.userId;
  if (actorId === targetId) { res.status(400).json({ error: "Không thể tạo hội thoại với chính mình." }); return; }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockPair(client, actorId, targetId);
    const target = await client.query("SELECT id FROM users WHERE id = $1 FOR KEY SHARE", [targetId]);
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy người chơi." });
      return;
    }
    if (await isBlocked(client, actorId, targetId)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Không thể mở hội thoại khi hai tài khoản đang chặn nhau." });
      return;
    }
    if (!(await areFriends(client, actorId, targetId))) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Chỉ có thể nhắn tin riêng với bạn bè đã xác nhận." });
      return;
    }

    const directKey = [actorId, targetId].sort().join(":");
    const conversation = await client.query(
      `INSERT INTO player_conversations (kind, direct_key, created_by)
       VALUES ('direct', $1, $2)
       ON CONFLICT (direct_key) DO UPDATE SET updated_at = player_conversations.updated_at
       RETURNING id`,
      [directKey, actorId],
    );
    const conversationId = conversation.rows[0].id as string;
    await client.query(
      `INSERT INTO player_conversation_members (conversation_id, user_id, role)
       VALUES ($1, $2, 'member'), ($1, $3, 'member')
       ON CONFLICT (conversation_id, user_id)
       DO UPDATE SET left_at = NULL`,
      [conversationId, actorId, targetId],
    );
    await client.query("COMMIT");
    res.status(200).json({ conversationId, kind: "direct" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

chatRouter.post("/groups", rateLimit("chat-create-group", 5, 60), async (req, res) => {
  const parsed = groupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dữ liệu không hợp lệ.", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const ownerId = req.auth!.sub;
  const memberIds = parsed.data.memberIds;
  if (new Set(memberIds).size !== memberIds.length || memberIds.includes(ownerId)) {
    res.status(400).json({ error: "Danh sách thành viên bị trùng hoặc chứa chính bạn." });
    return;
  }
  if (memberIds.length === 0) {
    res.status(400).json({ error: "Nhóm cần ít nhất một thành viên khác." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const memberId of [...memberIds].sort()) await lockPair(client, ownerId, memberId);
    const users = await client.query(
      "SELECT id FROM users WHERE id = ANY($1::uuid[])",
      [memberIds],
    );
    if (users.rowCount !== memberIds.length) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Một hoặc nhiều người chơi không tồn tại." });
      return;
    }
    const friends = await client.query(
      `SELECT count(*)::int AS count FROM player_friend_requests
        WHERE status = 'accepted'
          AND ((requester_id = $1 AND recipient_id = ANY($2::uuid[]))
            OR (recipient_id = $1 AND requester_id = ANY($2::uuid[])))`,
      [ownerId, memberIds],
    );
    if (friends.rows[0]?.count !== memberIds.length) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Chỉ có thể thêm bạn bè đã xác nhận vào nhóm." });
      return;
    }
    const blocked = await client.query(
      `SELECT 1 FROM player_blocks
        WHERE unblocked_at IS NULL
          AND ((blocker_id = $1 AND blocked_id = ANY($2::uuid[]))
            OR (blocked_id = $1 AND blocker_id = ANY($2::uuid[])))
        LIMIT 1`,
      [ownerId, memberIds],
    );
    if (blocked.rows[0]) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Không thể tạo nhóm với tài khoản đang có quan hệ chặn." });
      return;
    }

    const conversation = await client.query(
      "INSERT INTO player_conversations (kind, title, created_by) VALUES ('group', $1, $2) RETURNING id",
      [parsed.data.title, ownerId],
    );
    const conversationId = conversation.rows[0].id as string;
    await client.query(
      "INSERT INTO player_conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'owner')",
      [conversationId, ownerId],
    );
    for (const memberId of memberIds) {
      await client.query(
        "INSERT INTO player_conversation_members (conversation_id, user_id, role) VALUES ($1, $2, 'member')",
        [conversationId, memberId],
      );
    }
    await client.query("COMMIT");
    res.status(201).json({ conversationId, kind: "group", title: parsed.data.title });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

chatRouter.get("/conversations/:conversationId/messages", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.conversationId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã hội thoại không hợp lệ." }); return; }
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const before = typeof req.query.before === "string" ? new Date(req.query.before) : null;
  if (before && !Number.isFinite(before.getTime())) {
    res.status(400).json({ error: "Con trỏ thời gian không hợp lệ." });
    return;
  }
  const member = await pool.query(
    `SELECT 1 FROM player_conversation_members
      WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [parsedId.data, req.auth!.sub],
  );
  if (!member.rows[0]) { res.status(404).json({ error: "Không tìm thấy hội thoại." }); return; }

  const result = await pool.query(
    `SELECT m.id, m.conversation_id, m.sender_id, u.username,
            CASE WHEN m.deleted_at IS NULL THEN m.body ELSE NULL END AS body,
            (m.deleted_at IS NOT NULL) AS deleted, m.created_at, m.edited_at
       FROM player_messages m
       LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1
        AND ($2::timestamptz IS NULL OR m.created_at < $2)
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3`,
    [parsedId.data, before, page.limit],
  );
  res.json({ messages: result.rows.reverse(), limit: page.limit, nextBefore: result.rows[0]?.created_at ?? null });
});

chatRouter.post("/conversations/:conversationId/messages", rateLimit("chat-send-message", 60, 60), async (req, res) => {
  const parsedId = uuid.safeParse(req.params.conversationId);
  const parsedBody = messageBody.safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    res.status(400).json({
      error: "Dữ liệu không hợp lệ.",
      fields: parsedBody.success ? undefined : parsedBody.error.flatten().fieldErrors,
    });
    return;
  }

  const senderId = req.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const conversation = await client.query<{ kind: "direct" | "group" }>(
      `SELECT c.kind
         FROM player_conversations c
         JOIN player_conversation_members m ON m.conversation_id = c.id
        WHERE c.id = $1 AND m.user_id = $2 AND m.left_at IS NULL
        FOR SHARE OF c`,
      [parsedId.data, senderId],
    );
    if (!conversation.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy hội thoại." });
      return;
    }
    if (conversation.rows[0].kind === "direct") {
      const peer = await client.query<{ user_id: string }>(
        `SELECT user_id FROM player_conversation_members
          WHERE conversation_id = $1 AND user_id <> $2 AND left_at IS NULL
          LIMIT 1`,
        [parsedId.data, senderId],
      );
      if (peer.rows[0] && await isBlocked(client, senderId, peer.rows[0].user_id)) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Hội thoại riêng không thể tiếp tục do quan hệ chặn." });
        return;
      }
      if (peer.rows[0] && !(await areFriends(client, senderId, peer.rows[0].user_id))) {
        await client.query("ROLLBACK");
        res.status(403).json({ error: "Chỉ có thể tiếp tục nhắn tin riêng với bạn bè đã xác nhận." });
        return;
      }
    }

    let saved = await client.query(
      `INSERT INTO player_messages (conversation_id, sender_id, body, client_message_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (sender_id, client_message_id) WHERE client_message_id IS NOT NULL DO NOTHING
       RETURNING id, conversation_id, sender_id, body, created_at`,
      [parsedId.data, senderId, parsedBody.data.body, parsedBody.data.clientMessageId ?? null],
    );
    if (!saved.rows[0] && parsedBody.data.clientMessageId) {
      saved = await client.query(
        `SELECT id, conversation_id, sender_id, body, created_at
           FROM player_messages
          WHERE sender_id = $1 AND client_message_id = $2`,
        [senderId, parsedBody.data.clientMessageId],
      );
      if (!saved.rows[0] || saved.rows[0].conversation_id !== parsedId.data ||
          saved.rows[0].body !== parsedBody.data.body) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "clientMessageId đã được dùng cho một tin nhắn khác." });
        return;
      }
    } else {
      await client.query(
        `INSERT INTO player_message_receipts (message_id, user_id)
         SELECT $1, user_id FROM player_conversation_members
          WHERE conversation_id = $2 AND user_id <> $3 AND left_at IS NULL
         ON CONFLICT (message_id, user_id) DO NOTHING`,
        [saved.rows[0].id, parsedId.data, senderId],
      );
    }
    await client.query("UPDATE player_conversations SET updated_at = now() WHERE id = $1", [parsedId.data]);
    await client.query("COMMIT");
    res.status(201).json(saved.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

chatRouter.post("/conversations/:conversationId/read", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.conversationId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã hội thoại không hợp lệ." }); return; }
  const userId = req.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (!(await isActiveMember(client, parsedId.data, userId))) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy hội thoại." });
      return;
    }
    const result = await client.query(
      `INSERT INTO player_message_receipts (message_id, user_id, delivered_at, read_at)
       SELECT id, $2, now(), now()
         FROM player_messages
        WHERE conversation_id = $1 AND sender_id IS DISTINCT FROM $2 AND deleted_at IS NULL
       ON CONFLICT (message_id, user_id)
       DO UPDATE SET delivered_at = COALESCE(player_message_receipts.delivered_at, now()),
                     read_at = COALESCE(player_message_receipts.read_at, now())
       RETURNING message_id`,
      [parsedId.data, userId],
    );
    await client.query(
      "UPDATE player_conversation_members SET last_read_at = now() WHERE conversation_id = $1 AND user_id = $2",
      [parsedId.data, userId],
    );
    await client.query("COMMIT");
    res.json({ markedRead: result.rowCount ?? 0 });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

chatRouter.delete("/messages/:messageId", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.messageId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã tin nhắn không hợp lệ." }); return; }
  const result = await pool.query(
    `UPDATE player_messages m
        SET deleted_at = now()
      WHERE m.id = $1 AND m.sender_id = $2 AND m.deleted_at IS NULL
        AND m.created_at >= now() - interval '15 minutes'
        AND EXISTS (
          SELECT 1 FROM player_conversation_members cm
           WHERE cm.conversation_id = m.conversation_id
             AND cm.user_id = $2 AND cm.left_at IS NULL
        )
      RETURNING m.id`,
    [parsedId.data, req.auth!.sub],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "Không tìm thấy tin nhắn hoặc đã quá thời gian thu hồi." });
    return;
  }
  res.status(204).end();
});
