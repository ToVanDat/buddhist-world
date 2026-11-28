import type { NpcRegionSnapshot, NpcWorldSnapshot } from "@bw/shared";

/** Replace the active region's NPC view with one authoritative server snapshot. */
export function toNpcSnapshotState(snapshot: NpcRegionSnapshot): Record<string, NpcWorldSnapshot> {
  if (snapshot.regionId === "__reset__") return {};
  return Object.fromEntries(snapshot.npcs.map((npc) => [npc.id, npc]));
}
