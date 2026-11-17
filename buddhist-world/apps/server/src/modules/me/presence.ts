import { redis } from "../../lib/redis.js";
import { isOwnedFreshPresence } from "./checkpoints.js";

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

export interface OwnedPresenceSnapshot {
  ownerToken: string;
  ownerEpoch: number;
  presence: Record<string, string>;
}

/** Parse an atomic Redis owner/epoch/presence read and reject stale or mismatched leases. */
export function parseOwnedPresenceSnapshot(raw: unknown, now = Date.now()): OwnedPresenceSnapshot | null {
  if (!Array.isArray(raw) || raw.length < 4 || (raw.length - 2) % 2 !== 0) return null;
  const ownerToken = raw[0];
  const ownerEpoch = Number(raw[1]);
  if (typeof ownerToken !== "string" || ownerToken.length === 0 ||
      !Number.isSafeInteger(ownerEpoch) || ownerEpoch < 1) return null;

  const presence: Record<string, string> = {};
  for (let index = 2; index < raw.length; index += 2) {
    const key = raw[index];
    const value = raw[index + 1];
    if (typeof key !== "string" || typeof value !== "string") return null;
    presence[key] = value;
  }
  if (!isOwnedFreshPresence(presence, ownerToken, now)) return null;
  return { ownerToken, ownerEpoch, presence };
}

/** Read lease token, fencing epoch and presence in one Redis Lua execution. */
export async function getOwnedPresenceSnapshot(userId: string): Promise<OwnedPresenceSnapshot | null> {
  const raw = await redis.eval(
    READ_OWNED_PRESENCE_SCRIPT,
    3,
    `socket-owner:${userId}`,
    `socket-owner-epoch:${userId}`,
    `presence:${userId}`,
  );
  return parseOwnedPresenceSnapshot(raw);
}
