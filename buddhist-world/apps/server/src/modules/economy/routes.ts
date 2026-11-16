import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireTables } from "../../db/requireTables.js";
import { requireAuth } from "../auth/requireAuth.js";
import { rateLimit } from "../../lib/rateLimit.js";

export const economyRouter = Router();
economyRouter.use(requireAuth, requireTables("world_items", "world_item_prices", "player_wallets", "economy_ledger", "player_inventory"));

const purchaseBody = z.object({
  itemId: z.string().min(1).max(120),
  quantity: z.number().int().min(1).max(99).default(1),
  idempotencyKey: z.string().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
}).strict();

economyRouter.get("/wallet", async (req, res) => {
  const result = await pool.query(
    "SELECT currency_code, balance, updated_at FROM player_wallets WHERE user_id = $1 ORDER BY currency_code",
    [req.auth!.sub],
  );
  res.json({ wallets: result.rows });
});

economyRouter.get("/ledger", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const offset = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100_000) {
    res.status(400).json({ error: "Phân trang không hợp lệ." });
    return;
  }
  const result = await pool.query(
    `SELECT id, currency_code, entry_type, amount, reason, reference_type, reference_id, balance_after, created_at
       FROM economy_ledger WHERE user_id = $1
      ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [req.auth!.sub, limit, offset],
  );
  res.json({ entries: result.rows, limit, offset });
});

economyRouter.post("/purchase", rateLimit("economy-purchase", 12, 60), async (req, res) => {
  const body = purchaseBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Thông tin mua vật phẩm không hợp lệ.", fields: body.error.flatten().fieldErrors }); return; }
  const userId = req.auth!.sub;
  const currencyCode = "BWG";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO player_wallets (user_id, currency_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [userId, currencyCode],
    );
    const wallet = await client.query<{ balance: string }>(
      "SELECT balance::text AS balance FROM player_wallets WHERE user_id = $1 AND currency_code = $2 FOR UPDATE",
      [userId, currencyCode],
    );
    const previous = await client.query<{ id: string; metadata: { itemId?: string; quantity?: number } }>(
      "SELECT id, metadata FROM economy_ledger WHERE user_id = $1 AND currency_code = $2 AND idempotency_key = $3",
      [userId, currencyCode, body.data.idempotencyKey],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].metadata.itemId !== body.data.itemId ||
          previous.rows[0].metadata.quantity !== body.data.quantity) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Idempotency key đã được sử dụng cho yêu cầu mua khác." });
        return;
      }
      const inventory = await client.query(
        "SELECT item_id, quantity FROM player_inventory WHERE user_id = $1 AND item_id = $2",
        [userId, body.data.itemId],
      );
      await client.query("COMMIT");
      res.json({ replayed: true, balance: wallet.rows[0].balance, inventory: inventory.rows[0] ?? null });
      return;
    }

    const pricedItem = await client.query<{ price: string; stack_limit: number; name: string }>(
      `SELECT p.price::text AS price, i.stack_limit, i.name
         FROM world_item_prices p
         JOIN world_items i ON i.id = p.item_id
        WHERE p.item_id = $1 AND p.currency_code = $2 AND p.is_active = true
        FOR SHARE OF p, i`,
      [body.data.itemId, currencyCode],
    );
    if (!pricedItem.rows[0]) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Vật phẩm không có giá bán hoặc hiện không khả dụng." });
      return;
    }
    const inventory = await client.query<{ quantity: number }>(
      "SELECT quantity FROM player_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE",
      [userId, body.data.itemId],
    );
    const currentQuantity = inventory.rows[0]?.quantity ?? 0;
    if (currentQuantity + body.data.quantity > pricedItem.rows[0].stack_limit) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Số lượng vượt quá giới hạn xếp chồng của vật phẩm." });
      return;
    }
    const total = BigInt(pricedItem.rows[0].price) * BigInt(body.data.quantity);
    const currentBalance = BigInt(wallet.rows[0].balance);
    if (currentBalance < total) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Số dư không đủ.", required: total.toString(), balance: currentBalance.toString() });
      return;
    }
    const nextBalance = currentBalance - total;
    await client.query(
      "UPDATE player_wallets SET balance = $3::bigint, updated_at = now() WHERE user_id = $1 AND currency_code = $2",
      [userId, currencyCode, nextBalance.toString()],
    );
    await client.query(
      `INSERT INTO economy_ledger
        (user_id, currency_code, entry_type, amount, reason, reference_type, reference_id, idempotency_key, balance_after, metadata)
       VALUES ($1, $2, 'debit', $3::bigint, 'item_purchase', 'world_item', $4, $5, $6::bigint, $7::jsonb)`,
      [userId, currencyCode, total.toString(), body.data.itemId, body.data.idempotencyKey, nextBalance.toString(),
       JSON.stringify({ itemId: body.data.itemId, quantity: body.data.quantity })],
    );
    const updatedInventory = await client.query(
      `INSERT INTO player_inventory (user_id, item_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, item_id)
       DO UPDATE SET quantity = player_inventory.quantity + EXCLUDED.quantity, updated_at = now()
       RETURNING item_id, quantity`,
      [userId, body.data.itemId, body.data.quantity],
    );
    await client.query("COMMIT");
    res.status(201).json({
      replayed: false,
      item: { id: body.data.itemId, name: pricedItem.rows[0].name, quantity: body.data.quantity },
      charged: total.toString(),
      currencyCode,
      balance: nextBalance.toString(),
      inventory: updatedInventory.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});
