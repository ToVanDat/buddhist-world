import { isOwnedFreshPresence } from "./checkpoints.js";

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
  const hashEpoch = Number(presence.ownerEpoch);
  const sequence = Number(presence.seq);
  if (!Number.isSafeInteger(hashEpoch) || hashEpoch !== ownerEpoch ||
      !Number.isSafeInteger(sequence) || sequence < -1) return null;
  if (!isOwnedFreshPresence(presence, ownerToken, now)) return null;
  return { ownerToken, ownerEpoch, presence };
}
