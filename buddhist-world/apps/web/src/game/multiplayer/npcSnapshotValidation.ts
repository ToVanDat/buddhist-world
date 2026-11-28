import { getRegion, type NpcRegionSnapshot, type NpcScheduleState, type Vec3 } from "@bw/shared";

const ACTIVITIES = ["idle", "walk", "work", "pray", "talk", "rest"] as const;

function isMinute(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 1440;
}

function isPosition(value: unknown, bounds: { min: Vec3; max: Vec3 }): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((coordinate, index) =>
    typeof coordinate === "number" && Number.isFinite(coordinate) &&
    coordinate >= bounds.min[index]! && coordinate <= bounds.max[index]!);
}

function isScheduleState(value: unknown, regionId: string, bounds: { min: Vec3; max: Vec3 }): value is NpcScheduleState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<NpcScheduleState>;
  if (typeof state.id !== "string" || !state.id || state.id.length > 64 ||
      !isMinute(state.startMinute) || !isMinute(state.endMinute) || state.startMinute === state.endMinute ||
      state.regionId !== regionId || !isPosition(state.position, bounds) ||
      !ACTIVITIES.includes(state.activity as (typeof ACTIVITIES)[number]) ||
      (state.heading !== undefined && (typeof state.heading !== "number" || !Number.isFinite(state.heading))) ||
      (state.dialogueId !== undefined && (typeof state.dialogueId !== "string" || state.dialogueId.length > 128))) return false;

  if (state.path !== undefined) {
    if (state.activity !== "walk" || !Array.isArray(state.path) || state.path.length < 2 ||
        state.path.length > 256 || !state.path.every((point) => isPosition(point, bounds))) return false;
    for (let index = 1; index < state.path.length; index += 1) {
      const a = state.path[index - 1]!;
      const b = state.path[index]!;
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) <= 0.001) return false;
    }
  }
  if (state.speedMps !== undefined &&
      (state.path === undefined || typeof state.speedMps !== "number" ||
       !Number.isFinite(state.speedMps) || state.speedMps < 0.15 || state.speedMps > 2.5)) return false;
  return true;
}

/** Validate NPC world snapshots before publishing them into the game scene/store. */
export function validateNpcRegionSnapshot(raw: unknown, activeRegionId: string | null): NpcRegionSnapshot | null {
  if (!raw || typeof raw !== "object" || activeRegionId === null) return null;
  const snapshot = raw as Partial<NpcRegionSnapshot>;
  const region = snapshot.regionId === activeRegionId ? getRegion(activeRegionId) : undefined;
  if (!region || !isMinute(snapshot.worldMinute) || snapshot.timeZone !== "Asia/Ho_Chi_Minh" ||
      !Array.isArray(snapshot.npcs)) return null;

  const seen = new Set<string>();
  for (const npc of snapshot.npcs) {
    if (!npc || typeof npc !== "object" || typeof npc.id !== "string" || !npc.id || npc.id.length > 64 ||
        seen.has(npc.id) || typeof npc.name !== "string" || !npc.name.trim() || npc.name.length > 80 ||
        typeof npc.title !== "string" || !npc.title.trim() || npc.title.length > 80 ||
        typeof npc.active !== "boolean" || (npc.active !== (npc.state !== null)) ||
        (npc.state !== null && !isScheduleState(npc.state, region.id, region.bounds)) ||
        (npc.nextChangeMinute !== null && !isMinute(npc.nextChangeMinute))) return null;
    seen.add(npc.id);
  }
  return snapshot as NpcRegionSnapshot;
}
