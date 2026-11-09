export interface NpcScheduleEntry {
  id: string;
  startMinute: number;
  endMinute: number;
  regionId: string;
  position: [number, number, number];
  heading?: number;
  activity: "idle" | "walk" | "work" | "pray" | "talk" | "rest";
  dialogueId?: string;
}

export interface NpcScheduleResolution {
  entry: NpcScheduleEntry | null;
  nextChangeMinute: number | null;
}

function isMinute(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 1440;
}

function isValidEntry(value: unknown): value is NpcScheduleEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<NpcScheduleEntry>;
  return typeof entry.id === "string" && entry.id.length > 0 &&
    isMinute(entry.startMinute) && isMinute(entry.endMinute) &&
    entry.startMinute !== entry.endMinute &&
    typeof entry.regionId === "string" && entry.regionId.length > 0 &&
    Array.isArray(entry.position) && entry.position.length === 3 &&
    entry.position.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    ["idle", "walk", "work", "pray", "talk", "rest"].includes(String(entry.activity)) &&
    (entry.heading === undefined || (typeof entry.heading === "number" && Number.isFinite(entry.heading))) &&
    (entry.dialogueId === undefined || typeof entry.dialogueId === "string");
}

/** Validate authored schedule data before it is used to move an NPC. */
export function validateNpcSchedule(value: unknown): NpcScheduleEntry[] {
  if (!Array.isArray(value) || !value.every(isValidEntry)) {
    throw new Error("NPC schedule contains an invalid entry.");
  }
  const entries = value as NpcScheduleEntry[];
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate NPC schedule entry: ${entry.id}`);
    ids.add(entry.id);
  }
  // Overlapping windows make an NPC's authoritative location ambiguous.
  for (let minute = 0; minute < 1440; minute += 1) {
    const active = entries.filter((entry) => isActiveAt(entry, minute));
    if (active.length > 1) throw new Error("NPC schedule entries must not overlap.");
  }
  return entries;
}

function isActiveAt(entry: NpcScheduleEntry, minute: number): boolean {
  return entry.startMinute < entry.endMinute
    ? minute >= entry.startMinute && minute < entry.endMinute
    : minute >= entry.startMinute || minute < entry.endMinute;
}

/**
 * Resolve a deterministic daily schedule at a world-clock minute (0..1439).
 * Windows are start-inclusive/end-exclusive and may cross midnight.
 */
export function resolveNpcSchedule(
  schedule: readonly NpcScheduleEntry[],
  worldMinute: number,
): NpcScheduleResolution {
  if (!isMinute(worldMinute)) throw new RangeError("worldMinute must be an integer from 0 to 1439.");
  const entry = schedule.find((candidate) => isActiveAt(candidate, worldMinute)) ?? null;
  if (!entry) return { entry: null, nextChangeMinute: null };
  return { entry, nextChangeMinute: entry.endMinute };
}
