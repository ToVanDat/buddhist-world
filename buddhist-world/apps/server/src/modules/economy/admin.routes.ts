import { Router } from "express";
import { z } from "zod";
import { pool } from "../../db/pool.js";
import { requireTables } from "../../db/requireTables.js";
import { requireAuth } from "../auth/requireAuth.js";
import { requirePermission } from "../auth/requirePermission.js";

export const adminEconomyRouter = Router();
adminEconomyRouter.use(requireAuth, requireTables("world_items", "world_item_prices", "player_wallets", "economy_ledger"), requirePermission("economy.manage"));

const priceBody = z.object({
  price: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currencyCode: z.string().regex(/^[A-Z0-9]{3,8}$/).default("BWG"),
  isActive: z.boolean().default(true),
}).strict();

const grantBody = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currencyCode: z.string().regex(/^[A-Z0-9]{3,8}$/).default("BWG"),
  reason: z.string().min(3).max(160),
  idempotencyKey: z.string().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
}).strict();

adminEconomyRouter.put("/prices/:itemId", async (req, res) => {
  const itemId = z.string().min(1).max(120).safeParse(req.params.itemId);
  const body = priceBody.safeParse(req.body);
  if (!itemId.success || !body.success) {
    res.status(400).json({ error: "Dữ liệu giá vật phẩm không hợp lệ.", fields: body.success ? undefined : body.error.flatten().fieldErrors });
    return;
  }
  const item = await pool.query("SELECT id FROM world_items WHERE id = $1", [itemId.data]);
  if (!item.rowCount) { res.status(404).json({ error: "Không tìm thấy vật phẩm." }); return; }
  const result = await pool.query(
    `INSERT INTO world_item_prices (item_id, currency_code, price, is_active, created_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (item_id, currency_code)
     DO UPDATE SET price = EXCLUDED.price, is_active = EXCLUDED.is_active, updated_at = now()
     RETURNING item_id, currency_code, price, is_active, updated_at`,
    [itemId.data, body.data.currencyCode, body.data.price, body.data.isActive, req.auth!.sub],
  );
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, detail, ip)
     VALUES ($1, 'economy_item_price_changed', $2::jsonb, $3)`,
    [req.auth!.sub, JSON.stringify(result.rows[0]), req.ip],
  );
  res.json({ price: result.rows[0] });
});

adminEconomyRouter.post("/grants", async (req, res) => {
  const body = grantBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Dữ liệu cấp tiền không hợp lệ.", fields: body.error.flatten().fieldErrors }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query("SELECT id FROM users WHERE id = $1 FOR SHARE", [body.data.userId]);
    if (!target.rowCount) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Không tìm thấy người chơi." });
      return;
    }
    await client.query(
      "INSERT INTO player_wallets (user_id, currency_code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [body.data.userId, body.data.currencyCode],
    );
    const wallet = await client.query<{ balance: string }>(
      "SELECT balance::text AS balance FROM player_wallets WHERE user_id = $1 AND currency_code = $2 FOR UPDATE",
      [body.data.userId, body.data.currencyCode],
    );
    const walletRow = wallet.rows[0];
    if (!walletRow) throw new Error("Wallet row missing after insert/select.");
    const previous = await client.query<{ metadata: { amount?: number; reason?: string } }>(
      "SELECT metadata FROM economy_ledger WHERE user_id = $1 AND currency_code = $2 AND idempotency_key = $3",
      [body.data.userId, body.data.currencyCode, body.data.idempotencyKey],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].metadata.amount !== body.data.amount || previous.rows[0].metadata.reason !== body.data.reason) {
        await client.query("ROLLBACK");
        res.status(409).json({ error: "Idempotency key đã được dùng cho một khoản cấp khác." });
        return;
      }
      await client.query("COMMIT");
      res.json({ replayed: true, balance: walletRow.balance });
      return;
    }
    const nextBalance = BigInt(walletRow.balance) + BigInt(body.data.amount);
    if (nextBalance > 9_223_372_036_854_775_807n) {
      await client.query("ROLLBACK");
      res.status(409).json({ error: "Số dư vượt giới hạn lưu trữ." });
      return;
    }
    await client.query(
      "UPDATE player_wallets SET balance = $3::bigint, updated_at = now() WHERE user_id = $1 AND currency_code = $2",
      [body.data.userId, body.data.currencyCode, nextBalance.toString()],
    );
    await client.query(
      `INSERT INTO economy_ledger
        (user_id, currency_code, entry_type, amount, reason, reference_type, reference_id,
         idempotency_key, balance_after, metadata, created_by)
       VALUES ($1, $2, 'credit', $3::bigint, 'admin_grant', 'admin', $4, $5, $6::bigint, $7::jsonb, $4)`,
      [body.data.userId, body.data.currencyCode, String(body.data.amount), req.auth!.sub,
       body.data.idempotencyKey, nextBalance.toString(),
       JSON.stringify({ amount: body.data.amount, reason: body.data.reason, actorId: req.auth!.sub })],
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, detail, ip)
       VALUES ($1, 'economy_wallet_granted', $2::jsonb, $3)`,
      [req.auth!.sub, JSON.stringify({ targetUserId: body.data.userId, amount: body.data.amount, currencyCode: body.data.currencyCode, reason: body.data.reason }), req.ip],
    );
    await client.query("COMMIT");
    res.status(201).json({ replayed: false, balance: nextBalance.toString(), currencyCode: body.data.currencyCode });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});
