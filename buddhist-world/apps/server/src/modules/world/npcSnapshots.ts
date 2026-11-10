import type { NpcRegionSnapshot, NpcWorldSnapshot } from "@bw/shared";
import { validateNpcSchedule, resolveNpcSchedule, type NpcScheduleEntry } from "./npcSchedule.js";

export interface NpcScheduleRow {
  id: string;
  region_id: string;
  name: string;
  title: string;
  schedule: unknown;
}

/**
 * Pre-route authored NPC patrol polylines over the region navmesh.
 * undefined means no navmesh is installed yet (keep the authored waypoint route);
 * null means the navmesh exists but no safe route connects the segment (stop walking).
 */
export function routeNpcScheduleRows(
  rows: readonly NpcScheduleRow[],
  findPath: (regionId: string, start: [number, number, number], end: [number, number, number]) =>
    [number, number, number][] | null | undefined,
): NpcScheduleRow[] {
  return rows.map((row) => {
    const schedule = validateNpcSchedule(row.schedule).map((entry) => {
      if (entry.activity !== "walk" || !entry.path) return entry;
      const routed: [number, number, number][] = [[...entry.position]];
      for (let index = 1; index < entry.path.length; index += 1) {
        const segment = findPath(row.region_id, entry.path[index - 1]!, entry.path[index]!);
        if (segment === undefined) return entry; // legacy waypoint mode until a baked mesh is installed
        if (segment === null || segment.length < 2) {
          return { ...entry, activity: "idle" as const, path: undefined, speedMps: undefined };
        }
        for (const point of segment.slice(1)) {
          const previous = routed[routed.length - 1]!;
          if (Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]) > 0.01) {
            routed.push([...point]);
          }
        }
      }
      if (routed.length < 2 || routed.length > 256) {
        return { ...entry, activity: "idle" as const, path: undefined, speedMps: undefined };
      }
      return { ...entry, path: routed };
    });
    return { ...row, schedule };
  });
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
