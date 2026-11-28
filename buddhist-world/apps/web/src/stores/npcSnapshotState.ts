import type { NpcRegionSnapshot, NpcWorldSnapshot } from "@bw/shared";

/**
 * Convert one authoritative snapshot to the active NPC view.
 * null means the snapshot belongs to a stale or not-yet-joined region and must be ignored.
 */
export function toNpcSnapshotState(
  snapshot: NpcRegionSnapshot,
  activeRegionId: string | null,
): Record<string, NpcWorldSnapshot> | null {
  if (snapshot.regionId === "__reset__") return {};
  if (!activeRegionId || snapshot.regionId !== activeRegionId) return null;
  return Object.fromEntries(snapshot.npcs.map((npc) => [npc.id, npc]));
}
