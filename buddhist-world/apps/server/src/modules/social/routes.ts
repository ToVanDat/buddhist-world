import { Router, type Request, type Response, type NextFunction } from "express";
import type { PoolClient } from "pg";
import { z } from "zod";
import { SOCKET_EVENTS as E } from "@bw/shared";
import { emitToUser } from "../../realtime/publisher.js";
import { pool } from "../../db/pool.js";
import { rateLimit } from "../../lib/rateLimit.js";
import { requireAuth } from "../auth/requireAuth.js";
import { addNotification } from "../notifications/service.js";
import {
  isDistinctUserPair,
  isResendableRequestStatus,
  relationshipLockKey,
  type FriendRequestStatus,
} from "./relationshipRules.js";

export const socialRouter = Router();
socialRouter.use(requireAuth);

const requestBody = z.object({ recipientId: z.string().uuid().transform((value) => value.toLowerCase()) });
const uuid = z.string().uuid().transform((value) => value.toLowerCase());

function pageFromQuery(query: Record<string, unknown>) {
  const limitValue = typeof query.limit === "string" ? Number(query.limit) : 30;
  const offsetValue = typeof query.offset === "string" ? Number(query.offset) : 0;
  if (!Number.isInteger(limitValue) || limitValue < 1 || limitValue > 100 ||
      !Number.isInteger(offsetValue) || offsetValue < 0 || offsetValue > 100_000) return null;
  return { limit: limitValue, offset: offsetValue };
}

async function lockPair(client: PoolClient, first: string, second: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
    relationshipLockKey(first, second),
  ]);
}

async function hasActiveBlock(
  client: PoolClient,
  first: string,
  second: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM player_blocks
      WHERE unblocked_at IS NULL
        AND ((blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1))
      LIMIT 1`,
    [first, second],
  );
  return result.rowCount === 1;
}

socialRouter.get("/friends", async (req, res) => {
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT u.id, u.username, p.display_name, f.updated_at AS friends_since
       FROM player_friend_requests f
       JOIN users u
         ON u.id = CASE WHEN f.requester_id = $1 THEN f.recipient_id ELSE f.requester_id END
       LEFT JOIN player_profiles p ON p.user_id = u.id
      WHERE (f.requester_id = $1 OR f.recipient_id = $1)
        AND f.status = 'accepted'
        AND NOT EXISTS (
          SELECT 1 FROM player_blocks b
           WHERE b.unblocked_at IS NULL
             AND ((b.blocker_id = $1 AND b.blocked_id = u.id)
               OR (b.blocker_id = u.id AND b.blocked_id = $1))
        )
      ORDER BY f.updated_at DESC, u.id
      LIMIT $2 OFFSET $3`,
    [req.auth!.sub, page.limit, page.offset],
  );
  res.json({ friends: result.rows, limit: page.limit, offset: page.offset });
});

socialRouter.get("/requests", async (req, res) => {
  const direction = typeof req.query.direction === "string" ? req.query.direction : "incoming";
  if (direction !== "incoming" && direction !== "outgoing") {
    res.status(400).json({ error: "direction phải là incoming hoặc outgoing." });
    return;
  }
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const ownerColumn = direction === "incoming" ? "recipient_id" : "requester_id";
  const peerColumn = direction === "incoming" ? "requester_id" : "recipient_id";
  const result = await pool.query(
    `SELECT r.id, r.status, r.created_at,
            u.id AS user_id, u.username, p.display_name
       FROM player_friend_requests r
       JOIN users u ON u.id = r.${peerColumn}
       LEFT JOIN player_profiles p ON p.user_id = u.id
      WHERE r.${ownerColumn} = $1 AND r.status = 'pending'
      ORDER BY r.created_at DESC, r.id
      LIMIT $2 OFFSET $3`,
    [req.auth!.sub, page.limit, page.offset],
  );
  res.json({ direction, requests: result.rows, limit: page.limit, offset: page.offset });
});

socialRouter.post("/requests", rateLimit("social-friend-request", 10, 60), async (req, res) => {
  const parsed = requestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dữ liệu không hợp lệ.", fields: parsed.error.flatten().fieldErrors });
    return;
  }
  const requesterId = req.auth!.sub;
  const recipientId = parsed.data.recipientId;
  if (!isDistinctUserPair(requesterId, recipientId)) {
    res.status(400).json({ error: "Không thể gửi lời mời kết bạn cho chính mình." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockPair(client, requesterId, recipientId);
    const target = await client.query("SELECT id FROM users WHERE id = $1 FOR KEY SHARE", [recipientId]);
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy người chơi." });
      return;
    }
    if (await hasActiveBlock(client, requesterId, recipientId)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Không thể gửi lời mời giữa hai tài khoản đang chặn nhau." });
      return;
    }

    const accepted = await client.query(
      `SELECT id FROM player_friend_requests
        WHERE status = 'accepted'
          AND ((requester_id = $1 AND recipient_id = $2)
            OR (requester_id = $2 AND recipient_id = $1))
        LIMIT 1`,
      [requesterId, recipientId],
    );
    if (accepted.rows[0]) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Hai người chơi đã là bạn bè." });
      return;
    }

    // A reciprocal pending request is accepted atomically instead of creating a duplicate edge.
    const reciprocal = await client.query(
      `SELECT id FROM player_friend_requests
        WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'
        FOR UPDATE`,
      [recipientId, requesterId],
    );
    if (reciprocal.rows[0]) {
      await client.query(
        "UPDATE player_friend_requests SET status = 'accepted', updated_at = now(), responded_at = now() WHERE id = $1",
        [reciprocal.rows[0].id],
      );
      await addNotification(client, {
        userId: recipientId, actorId: requesterId, kind: "friend_accepted",
        payload: { requestId: reciprocal.rows[0].id },
        dedupeKey: `friend-accepted:${reciprocal.rows[0].id}:${recipientId}`,
      });
      await addNotification(client, {
        userId: requesterId, actorId: recipientId, kind: "friend_accepted",
        payload: { requestId: reciprocal.rows[0].id },
        dedupeKey: `friend-accepted:${reciprocal.rows[0].id}:${requesterId}`,
      });
      await client.query("COMMIT");
      emitToUser(recipientId, E.serverNotification, { kind: "friend_accepted", payload: { requestId: reciprocal.rows[0].id } });
      emitToUser(requesterId, E.serverNotification, { kind: "friend_accepted", payload: { requestId: reciprocal.rows[0].id } });
      res.status(200).json({ requestId: reciprocal.rows[0].id, status: "accepted" });
      return;
    }

    const existing = await client.query<{ id: string; status: FriendRequestStatus }>(
      `SELECT id, status FROM player_friend_requests
        WHERE requester_id = $1 AND recipient_id = $2
        FOR UPDATE`,
      [requesterId, recipientId],
    );
    if (existing.rows[0] && !isResendableRequestStatus(existing.rows[0].status)) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Lời mời kết bạn đang chờ hoặc đã được xử lý." });
      return;
    }

    const saved = existing.rows[0]
      ? await client.query(
          `UPDATE player_friend_requests
              SET status = 'pending', created_at = now(), updated_at = now(), responded_at = NULL
            WHERE id = $1 RETURNING id`,
          [existing.rows[0].id],
        )
      : await client.query(
          `INSERT INTO player_friend_requests (requester_id, recipient_id)
           VALUES ($1, $2) RETURNING id`,
          [requesterId, recipientId],
        );
    await addNotification(client, {
      userId: recipientId, actorId: requesterId, kind: "friend_request",
      payload: { requestId: saved.rows[0].id },
    });
    await client.query("COMMIT");
    emitToUser(recipientId, E.serverNotification, { kind: "friend_request", payload: { requestId: saved.rows[0].id } });
    res.status(201).json({ requestId: saved.rows[0].id, status: "pending" });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

async function respondToRequest(
  req: Request<{ requestId: string }>,
  res: Response,
  next: NextFunction,
  action: "accepted" | "declined" | "cancelled",
) {
  const parsedId = uuid.safeParse(req.params.requestId);
  if (!parsedId.success) { res.status(400).json({ error: "Mã lời mời không hợp lệ." }); return; }
  const actorId = req.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const identity = await client.query<{ requester_id: string; recipient_id: string }>(
      `SELECT requester_id, recipient_id FROM player_friend_requests
        WHERE id = $1 AND ${action === "cancelled" ? "requester_id" : "recipient_id"} = $2`,
      [parsedId.data, actorId],
    );
    const pair = identity.rows[0];
    if (!pair) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy lời mời phù hợp." });
      return;
    }
    // Acquire the pair lock before row locks in every relationship mutation to avoid lock-order deadlocks.
    await lockPair(client, pair.requester_id, pair.recipient_id);
    const locked = await client.query<{ requester_id: string; recipient_id: string; status: FriendRequestStatus }>(
      `SELECT requester_id, recipient_id, status FROM player_friend_requests
        WHERE id = $1 AND ${action === "cancelled" ? "requester_id" : "recipient_id"} = $2
        FOR UPDATE`,
      [parsedId.data, actorId],
    );
    const request = locked.rows[0];
    if (!request || request.status !== "pending") {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Lời mời không còn ở trạng thái chờ." });
      return;
    }
    if (action === "accepted" && await hasActiveBlock(client, request.requester_id, request.recipient_id)) {
      await client.query("ROLLBACK");
      res.status(403).json({ error: "Không thể chấp nhận lời mời khi hai tài khoản đang chặn nhau." });
      return;
    }
    await client.query(
      "UPDATE player_friend_requests SET status = $2, updated_at = now(), responded_at = now() WHERE id = $1",
      [parsedId.data, action],
    );
    if (action === "accepted") {
      await addNotification(client, {
        userId: request.requester_id, actorId: actorId, kind: "friend_accepted",
        payload: { requestId: parsedId.data },
        dedupeKey: `friend-accepted:${parsedId.data}:${request.requester_id}`,
      });
    }
    await client.query("COMMIT");
    if (action === "accepted") {
      emitToUser(request.requester_id, E.serverNotification, { kind: "friend_accepted", payload: { requestId: parsedId.data } });
    }
    res.json({ requestId: parsedId.data, status: action });
  } catch (error) {
    await client.query("ROLLBACK");
    next(error);
  } finally {
    client.release();
  }
}

socialRouter.post("/requests/:requestId/accept", async (req, res, next) =>
  respondToRequest(req, res, next, "accepted"));
socialRouter.post("/requests/:requestId/decline", async (req, res, next) =>
  respondToRequest(req, res, next, "declined"));
socialRouter.delete("/requests/:requestId", async (req, res, next) =>
  respondToRequest(req, res, next, "cancelled"));

socialRouter.delete("/friends/:friendId", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.friendId);
  if (!parsedId.success || parsedId.data === req.auth!.sub) {
    res.status(400).json({ error: "Mã người chơi không hợp lệ." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockPair(client, req.auth!.sub, parsedId.data);
    const result = await client.query(
      `UPDATE player_friend_requests
          SET status = 'removed', updated_at = now(), responded_at = now()
        WHERE status = 'accepted'
          AND ((requester_id = $1 AND recipient_id = $2)
            OR (requester_id = $2 AND recipient_id = $1))
        RETURNING id`,
      [req.auth!.sub, parsedId.data],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy quan hệ bạn bè." });
      return;
    }
    await client.query("COMMIT");
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

socialRouter.get("/blocks", async (req, res) => {
  const page = pageFromQuery(req.query as Record<string, unknown>);
  if (!page) { res.status(400).json({ error: "Phân trang không hợp lệ." }); return; }
  const result = await pool.query(
    `SELECT b.id, b.blocked_at, u.id AS user_id, u.username, p.display_name
       FROM player_blocks b
       JOIN users u ON u.id = b.blocked_id
       LEFT JOIN player_profiles p ON p.user_id = u.id
      WHERE b.blocker_id = $1 AND b.unblocked_at IS NULL
      ORDER BY b.blocked_at DESC, b.id
      LIMIT $2 OFFSET $3`,
    [req.auth!.sub, page.limit, page.offset],
  );
  res.json({ blocks: result.rows, limit: page.limit, offset: page.offset });
});

socialRouter.put("/blocks/:userId", rateLimit("social-block", 20, 60), async (req, res) => {
  const parsedId = uuid.safeParse(req.params.userId);
  if (!parsedId.success || parsedId.data === req.auth!.sub) {
    res.status(400).json({ error: "Mã người chơi không hợp lệ." });
    return;
  }
  const blockerId = req.auth!.sub;
  const blockedId = parsedId.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockPair(client, blockerId, blockedId);
    const target = await client.query("SELECT id FROM users WHERE id = $1 FOR KEY SHARE", [blockedId]);
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy người chơi." });
      return;
    }
    await client.query(
      `INSERT INTO player_blocks (blocker_id, blocked_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_id, blocked_id) WHERE unblocked_at IS NULL DO NOTHING`,
      [blockerId, blockedId],
    );
    await client.query(
      `UPDATE player_friend_requests
          SET status = CASE WHEN status = 'accepted' THEN 'removed' ELSE 'cancelled' END,
              updated_at = now(), responded_at = now()
        WHERE status IN ('pending', 'accepted')
          AND ((requester_id = $1 AND recipient_id = $2)
            OR (requester_id = $2 AND recipient_id = $1))`,
      [blockerId, blockedId],
    );
    await client.query("COMMIT");
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

socialRouter.delete("/blocks/:userId", async (req, res) => {
  const parsedId = uuid.safeParse(req.params.userId);
  if (!parsedId.success || parsedId.data === req.auth!.sub) {
    res.status(400).json({ error: "Mã người chơi không hợp lệ." });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockPair(client, req.auth!.sub, parsedId.data);
    const result = await client.query(
      `UPDATE player_blocks SET unblocked_at = now()
        WHERE blocker_id = $1 AND blocked_id = $2 AND unblocked_at IS NULL
        RETURNING id`,
      [req.auth!.sub, parsedId.data],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy người chơi trong danh sách chặn." });
      return;
    }
    await client.query("COMMIT");
    res.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
