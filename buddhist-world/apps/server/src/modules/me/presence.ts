import { redis } from "../../lib/redis.js";
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
