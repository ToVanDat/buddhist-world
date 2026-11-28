import type { NpcRegionSnapshot, NpcWorldSnapshot } from "@bw/shared";
import { validateNpcSchedule, resolveNpcSchedule, type NpcScheduleEntry } from "./npcSchedule.js";


/** Keep schedule data scoped to the database row's authoritative region. */
function validateNpcScheduleForRegion(value: unknown, regionId: string): NpcScheduleEntry[] {
  try {
    const schedule = validateNpcSchedule(value);
    return schedule.every((entry) => entry.regionId === regionId) ? schedule : [];
  } catch {
    // One malformed NPC row must not take every other NPC in this region offline.
    return [];
  }
}

function isFiniteWaypoint(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function waypointDistance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

export interface NpcScheduleRow {
  id: string;
  region_id: string;
  name: string;
  title: string;
  schedule: unknown;
}

/**
 * Pre-route authored NPC patrol polylines over the region navmesh.
 * undefined means no navmesh is installed yet (fail closed and stop walking);
 * null means the navmesh exists but no safe route connects the segment (stop walking).
 */
export function routeNpcScheduleRows(
  rows: readonly NpcScheduleRow[],
  findPath: (regionId: string, start: [number, number, number], end: [number, number, number]) =>
    [number, number, number][] | null | undefined,
): NpcScheduleRow[] {
  return rows.map((row) => {
    const schedule = validateNpcScheduleForRegion(row.schedule, row.region_id).map((entry) => {
      if (entry.activity !== "walk" || !entry.path) return entry;
      const routed: [number, number, number][] = [[...entry.position]];
      for (let index = 1; index < entry.path.length; index += 1) {
        let segment: [number, number, number][] | null | undefined;
        try {
          segment = findPath(row.region_id, entry.path[index - 1]!, entry.path[index]!);
        } catch {
          // A pathfinder failure is isolated to this NPC schedule entry. Do not
          // abort the region refresh or leave a stale walking snapshot active.
          return { ...entry, activity: "idle" as const, path: undefined, speedMps: undefined };
        }
        if (segment === undefined) {
          // Fail closed: do not publish unverified waypoint movement while the region has no baked navmesh.
          return { ...entry, activity: "idle" as const, path: undefined, speedMps: undefined };
        }
        if (segment === null || segment.length < 2 || segment.length > 256 ||
            !segment.every(isFiniteWaypoint)) {
          return { ...entry, activity: "idle" as const, path: undefined, speedMps: undefined };
        }
        const previous = routed[routed.length - 1]!;
        // Pathfinding may project endpoints onto the mesh. Reject large snaps
        // or discontinuities instead of teleporting an NPC onto another surface.
        if (waypointDistance(segment[0]!, entry.path[index - 1]!) > 1.5 ||
            waypointDistance(segment[0]!, previous) > 1.5 ||
            waypointDistance(segment[segment.length - 1]!, entry.path[index]!) > 1.5) {
          return { ...entry, activity: "idle" as const, path: undefined, speedMps: undefined };
        }
        for (const point of segment.slice(1)) {
          const last = routed[routed.length - 1]!;
          if (waypointDistance(point, last) > 0.01) routed.push([...point]);
        }
        if (routed.length > 256) {
          return { ...entry, activity: "idle" as const, path: undefined, speedMps: undefined };
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
    const schedule: NpcScheduleEntry[] = validateNpcScheduleForRegion(row.schedule, row.region_id);
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
