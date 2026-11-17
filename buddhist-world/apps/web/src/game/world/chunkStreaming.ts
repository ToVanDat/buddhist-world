import type { RegionChunkDef, Vec3 } from "@bw/shared";
function distanceToBounds(position: Vec3, bounds: RegionChunkDef["bounds"]): number {
  let squared = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    const value = position[axis]!, min = bounds.min[axis]!, max = bounds.max[axis]!;
    const delta = value < min ? min - value : value > max ? value - max : 0;
    squared += delta * delta;
  }
  return Math.sqrt(squared);
}
/** Enter/exit radii create hysteresis and prevent chunk boundary thrashing. */
export function resolveActiveChunkIds(position: Vec3, chunks: readonly RegionChunkDef[], current: ReadonlySet<string>): string[] {
  return chunks.map((chunk) => ({
    id: chunk.id, priority: chunk.priority ?? 0,
    distance: distanceToBounds(position, chunk.bounds),
    active: distanceToBounds(position, chunk.bounds) <= (current.has(chunk.id) ? chunk.unloadRadius : chunk.loadRadius),
  })).filter((chunk) => chunk.active)
    .sort((a, b) => b.priority - a.priority || a.distance - b.distance || a.id.localeCompare(b.id))
    .map((chunk) => chunk.id);
}
