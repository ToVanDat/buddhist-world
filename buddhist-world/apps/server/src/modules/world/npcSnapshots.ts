import type { NpcRegionSnapshot, NpcWorldSnapshot } from "@bw/shared";
import { validateNpcSchedule, resolveNpcSchedule, type NpcScheduleEntry } from "./npcSchedule.js";

export interface NpcScheduleRow {
  id: string;
  region_id: string;
  name: string;
  title: string;
  schedule: unknown;
}

/** Build deterministic region snapshots from database-authored schedule rows. */
export function buildNpcRegionSnapshots(
  rows: readonly NpcScheduleRow[],
  worldMinute: number,
  worldSecond = 0,
): NpcRegionSnapshot[] {
  const grouped = new Map<string, NpcWorldSnapshot[]>();
  for (const row of rows) {
    const schedule: NpcScheduleEntry[] = validateNpcSchedule(row.schedule);
    const resolved = resolveNpcSchedule(schedule, worldMinute, worldSecond);
    const npc: NpcWorldSnapshot = {
      id: row.id,
      name: row.name,
      title: row.title,
      active: resolved.entry !== null,
      state: resolved.entry,
      nextChangeMinute: resolved.nextChangeMinute,
    };
    const list = grouped.get(row.region_id) ?? [];
    list.push(npc);
    grouped.set(row.region_id, list);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([regionId, npcs]) => ({
    regionId,
    worldMinute,
    timeZone: "Asia/Ho_Chi_Minh",
    npcs: npcs.sort((a, b) => a.id.localeCompare(b.id)),
  }));
}
