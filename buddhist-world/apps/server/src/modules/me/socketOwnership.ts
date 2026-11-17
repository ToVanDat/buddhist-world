import type { PoolClient } from "pg";
import { pool } from "../../db/pool.js";
export interface SocketOwnership { ownerToken: string; ownerEpoch: number }
export class SocketOwnershipFenceError extends Error {
  readonly code = "socket_ownership_replaced";
  constructor() { super("The socket no longer owns this player's durable authority epoch."); this.name = "SocketOwnershipFenceError"; }
}
/** PostgreSQL serializes owner claims; Redis receives only the committed epoch. */
export async function claimSocketOwnership(userId: string, ownerToken: string, minimumRedisEpoch = 0): Promise<number> {
  if (!Number.isSafeInteger(minimumRedisEpoch) || minimumRedisEpoch < 0) throw new Error("Invalid Redis ownership epoch.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ owner_epoch: string | number }>(
      `INSERT INTO socket_owner_authority (user_id, owner_token, owner_epoch, updated_at)
       VALUES ($1, $2, $3::bigint + 1, now())
       ON CONFLICT (user_id) DO UPDATE
         SET owner_token = EXCLUDED.owner_token,
             owner_epoch = GREATEST(socket_owner_authority.owner_epoch, EXCLUDED.owner_epoch - 1) + 1,
             updated_at = now()
       RETURNING owner_epoch`, [userId, ownerToken, minimumRedisEpoch]);
    const epoch = Number(result.rows[0]?.owner_epoch);
    if (!Number.isSafeInteger(epoch) || epoch < 1) throw new Error("Invalid durable ownership epoch.");
    await client.query("COMMIT");
    return epoch;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
/** Lock authority through COMMIT so a takeover cannot overtake an in-flight mutation. */
export async function lockSocketOwnership(client: PoolClient, userId: string, expected: SocketOwnership): Promise<boolean> {
  const result = await client.query<{ owner_token: string; owner_epoch: string | number }>(
    "SELECT owner_token, owner_epoch FROM socket_owner_authority WHERE user_id = $1 FOR UPDATE", [userId]);
  const row = result.rows[0];
  return !!row && row.owner_token === expected.ownerToken && Number(row.owner_epoch) === expected.ownerEpoch;
}
export async function requireSocketOwnership(client: PoolClient, userId: string, expected: SocketOwnership): Promise<void> {
  if (!(await lockSocketOwnership(client, userId, expected))) throw new SocketOwnershipFenceError();
}
