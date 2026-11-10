export type NpcPosition = [number, number, number];

export interface NpcScheduleEntry {
  id: string;
  startMinute: number;
  endMinute: number;
  regionId: string;
  position: NpcPosition;
  /** Optional patrol route. The first point must equal position. */
  path?: NpcPosition[];
  /** Walking speed in metres per second; defaults to 0.7 for a path. */
  speedMps?: number;
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

function isPosition(value: unknown): value is NpcPosition {
  return Array.isArray(value) && value.length === 3 &&
    value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}

function isValidEntry(value: unknown): value is NpcScheduleEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<NpcScheduleEntry>;
  const validPath = entry.path === undefined || (
    Array.isArray(entry.path) && entry.path.length >= 2 && entry.path.length <= 32 &&
    entry.path.every(isPosition) && isPosition(entry.position) &&
    entry.path[0]!.every((coordinate, index) => Math.abs(coordinate - entry.position![index]!) <= 0.001) &&
    entry.path.slice(1).every((point, index) => {
      const previous = entry.path![index]!;
      return Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]) > 0.001;
    })
  );
  const validSpeed = entry.speedMps === undefined ||
    (typeof entry.speedMps === "number" && Number.isFinite(entry.speedMps) && entry.speedMps >= 0.15 && entry.speedMps <= 2.5);
  return typeof entry.id === "string" && entry.id.length > 0 &&
    isMinute(entry.startMinute) && isMinute(entry.endMinute) &&
    entry.startMinute !== entry.endMinute &&
    typeof entry.regionId === "string" && entry.regionId.length > 0 &&
    isPosition(entry.position) && validPath && validSpeed &&
    (entry.path === undefined || entry.activity === "walk") &&
    (entry.speedMps === undefined || entry.path !== undefined) &&
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
  // Split midnight-crossing windows, then check overlaps in O(n log n).
  const intervals = entries.flatMap((entry) => entry.startMinute < entry.endMinute
    ? [{ start: entry.startMinute, end: entry.endMinute }]
    : [{ start: entry.startMinute, end: 1440 }, { start: 0, end: entry.endMinute }]);
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index]!.start < intervals[index - 1]!.end) {
      throw new Error("NPC schedule entries must not overlap.");
    }
  }
  return entries;
}

function isActiveAt(entry: NpcScheduleEntry, minute: number): boolean {
  return entry.startMinute < entry.endMinute
    ? minute >= entry.startMinute && minute < entry.endMinute
    : minute >= entry.startMinute || minute < entry.endMinute;
}

function routeLength(path: readonly NpcPosition[]): number {
  let total = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index]!;
    const b = path[index + 1]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

/** Deterministically patrol a polyline, reversing at each endpoint. */
export function sampleNpcPatrol(path: readonly NpcPosition[], distanceTravelled: number): { position: NpcPosition; heading: number } {
  if (!Array.isArray(path) || path.length < 2 || path.length > 32 ||
      !path.every(isPosition) || !Number.isFinite(distanceTravelled) || distanceTravelled < 0) {
    throw new RangeError("A patrol requires 2–32 finite points and a non-negative distance.");
  }
  for (let index = 1; index < path.length; index += 1) {
    const previous = path[index - 1]!;
    const current = path[index]!;
    if (Math.hypot(current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]) <= 0.001) {
      throw new RangeError("A patrol path cannot contain zero-length segments.");
    }
  }
  const total = routeLength(path);
  if (total <= 0) throw new RangeError("A patrol path must have a non-zero length.");
  const cycle = total * 2;
  const phase = distanceTravelled % cycle;
  const reverse = phase > total;
  const distance = reverse ? cycle - phase : phase;
  let traversed = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const a = path[index]!;
    const b = path[index + 1]!;
    const segment = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (distance <= traversed + segment || index === path.length - 2) {
      const ratio = Math.max(0, Math.min(1, (distance - traversed) / segment));
      const dx = b[0] - a[0];
      const dz = b[2] - a[2];
      return {
        position: [
          a[0] + dx * ratio,
          a[1] + (b[1] - a[1]) * ratio,
          a[2] + dz * ratio,
        ],
        heading: Math.atan2(dx, dz) + (reverse ? Math.PI : 0),
      };
    }
    traversed += segment;
  }
  return { position: [...path[0]!], heading: 0 };
}

/**
 * Resolve a deterministic daily schedule at a Vietnam-local clock time.
 * Windows are start-inclusive/end-exclusive and may cross midnight.
 */
export function resolveNpcSchedule(
  schedule: readonly NpcScheduleEntry[],
  worldMinute: number,
  worldSecond = 0,
): NpcScheduleResolution {
  if (!isMinute(worldMinute)) throw new RangeError("worldMinute must be an integer from 0 to 1439.");
  if (!Number.isInteger(worldSecond) || worldSecond < 0 || worldSecond > 59) {
    throw new RangeError("worldSecond must be an integer from 0 to 59.");
  }
  const entry = schedule.find((candidate) => isActiveAt(candidate, worldMinute)) ?? null;
  if (!entry) return { entry: null, nextChangeMinute: null };
  if (!entry.path || entry.activity !== "walk") return { entry, nextChangeMinute: entry.endMinute };
  const elapsedMinutes = (worldMinute - entry.startMinute + 1440) % 1440;
  const patrol = sampleNpcPatrol(entry.path, (elapsedMinutes * 60 + worldSecond) * (entry.speedMps ?? 0.7));
  return {
    entry: { ...entry, position: patrol.position, heading: patrol.heading },
    nextChangeMinute: entry.endMinute,
  };
}
