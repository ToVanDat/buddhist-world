import { redis } from "../../lib/redis.js";
import { lockSocketOwnership } from "./socketOwnership.js";
import { parseOwnedPresenceSnapshot } from "./presenceSnapshot.js";
export { parseOwnedPresenceSnapshot, type OwnedPresenceSnapshot } from "./presenceSnapshot.js";

const READ_OWNED_PRESENCE_SCRIPT = `
local ownerToken = redis.call("GET", KEYS[1])
local ownerEpoch = redis.call("GET", KEYS[2])
if not ownerToken or not ownerEpoch then return {} end
local fields = redis.call("HGETALL", KEYS[3])
if #fields == 0 then return {} end
local result = { ownerToken, ownerEpoch }
for index = 1, #fields do
  result[#result + 1] = fields[index]
end
return result
`;

/** Read lease token, fencing epoch and presence in one Redis Lua execution. */
export async function getOwnedPresenceSnapshot(userId: string): Promise<import("./presenceSnapshot.js").OwnedPresenceSnapshot | null> {
  const raw = await redis.eval(
    READ_OWNED_PRESENCE_SCRIPT,
    3,
    `socket-owner:${userId}`,
    `socket-owner-epoch:${userId}`,
    `presence:${userId}`,
  );
  return parseOwnedPresenceSnapshot(raw);
}

/**
 * Re-read the live Redis lease and persist its epoch in PostgreSQL before a
 * server-authoritative gameplay mutation. A replaced socket or a newer DB
 * fence cannot commit an action under an older lease.
 */
export async function persistOwnedPresenceFence(
  client: import("pg").PoolClient,
  userId: string,
  expected: import("./presenceSnapshot.js").OwnedPresenceSnapshot,
): Promise<import("./presenceSnapshot.js").OwnedPresenceSnapshot | null> {
  if (!(await lockSocketOwnership(client, userId, expected))) return null;
  const current = await getOwnedPresenceSnapshot(userId);
  if (!current || current.ownerToken !== expected.ownerToken || current.ownerEpoch !== expected.ownerEpoch) return null;
  const persisted = await client.query(
    `UPDATE player_locations SET owner_epoch = $2
       WHERE user_id = $1 AND owner_epoch <= $2
       RETURNING owner_epoch`,
    [userId, current.ownerEpoch],
  );
  return persisted.rows[0] ? current : null;
}
