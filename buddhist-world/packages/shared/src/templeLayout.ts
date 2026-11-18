import type { Vec3 } from "./types.js";
const point = (x: number, y: number, z: number): Vec3 => [x, y, z];

/** Single source of truth for world-space temple placement (Y-up, metres). */
export const TEMPLE_LAYOUT = {
  coordinateSystem: "Y_UP_METERS",
  bounds: { min: point(-120, -5, -120), max: point(120, 60, 120) },
  anchors: {
    tamQuan: point(0, 0, 20), courtyard: point(0, 0, 0),
    mainHall: point(0, 0, -22), lotusPond: point(-18, 0, 4),
  },
  spawns: {
    mainEntrance: { position: point(0, 1.2, 20), yaw: Math.PI },
    courtyard: { position: point(0, 1.2, 0), yaw: Math.PI },
    mainHall: { position: point(0, 1.2, -22), yaw: Math.PI },
    // 14m pond plus 1.5m player safety margin; spawn is on the north bank.
    lotusPond: { position: point(-18, 1.2, 13), yaw: Math.PI / 2 },
  },
  pond: {
    center: point(-18, 0, 4), halfExtents: [7, 7] as [number, number],
    waterSurfaceY: 0.025, collisionBottomY: -2, collisionTopY: 1.1, spawnClearance: 1.5,
  },
  npcGuideFallback: { position: point(8, 1.2, -17) },
  environment: {
    trees: [
      { position: point(-34, 0, 13), scale: 1.15 }, { position: point(-36, 0, -18), scale: 0.92 },
      { position: point(35, 0, 12), scale: 1.08 }, { position: point(37, 0, -18), scale: 1.12 },
      { position: point(-28, 0, -39), scale: 0.88 }, { position: point(29, 0, -40), scale: 0.96 },
      { position: point(-52, 0, 35), scale: 1.25 }, { position: point(53, 0, 34), scale: 1.18 },
      { position: point(-56, 0, -18), scale: 1.05 }, { position: point(56, 0, -15), scale: 1.1 },
    ],
    grassPatches: [
      { position: point(-34, 0, 0), seed: 3, width: 12, depth: 9, count: 260 },
      { position: point(34, 0, 0), seed: 7, width: 12, depth: 9, count: 260 },
      { position: point(-42, 0, -29), seed: 11, width: 10, depth: 12, count: 240 },
      { position: point(42, 0, -29), seed: 17, width: 10, depth: 12, count: 240 },
      { position: point(-48, 0, 23), seed: 21, width: 13, depth: 10, count: 280 },
      { position: point(48, 0, 22), seed: 29, width: 13, depth: 10, count: 280 },
      { position: point(-23, 0, -45), seed: 37, width: 12, depth: 9, count: 220 },
      { position: point(23, 0, -46), seed: 41, width: 12, depth: 9, count: 220 },
    ],
    rocks: [
      { position: point(-27, 0.45, 10), scale: point(2.8, 0.9, 1.8) },
      { position: point(-25, 0.3, -1), scale: point(1.7, 0.6, 1.2) },
      { position: point(-10, 0.38, 12), scale: point(2.2, 0.76, 1.5) },
      { position: point(24, 0.35, 8), scale: point(2.5, 0.72, 1.8) },
      { position: point(27, 0.42, -3), scale: point(1.8, 0.84, 1.35) },
      { position: point(-24, 0.4, -31), scale: point(2.4, 0.8, 1.7) },
      { position: point(24, 0.36, -32), scale: point(2.1, 0.72, 1.6) },
    ],
    mountains: [
      { position: point(-76, -1, -83), width: 88, depth: 48, height: 28, seed: 2 },
      { position: point(73, -1, -92), width: 96, depth: 54, height: 34, seed: 5 },
      { position: point(0, -1, -112), width: 120, depth: 48, height: 31, seed: 9 },
      { position: point(-108, -1, 8), width: 54, depth: 88, height: 24, seed: 12 },
      { position: point(108, -1, 12), width: 58, depth: 92, height: 26, seed: 16 },
    ],
  },
};

/** True if a point lies inside the pond rectangle plus an optional safety margin. */
export function isInsideLotusPondFootprint(position: readonly number[], margin = 0): boolean {
  if (position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(margin) || margin < 0) return false;
  const [x, , z] = position;
  const [cx, , cz] = TEMPLE_LAYOUT.pond.center;
  const [halfX, halfZ] = TEMPLE_LAYOUT.pond.halfExtents;
  return Math.abs(x! - cx) <= halfX + margin && Math.abs(z! - cz) <= halfZ + margin;
}

/** Static spawn acceptance: no spawn may overlap the pond's player safety envelope. */
export function validateTempleSpawnSafety(spawns: readonly { id: string; position: readonly number[] }[], regionId = "temple_complex"): string[] {
  if (regionId !== "temple_complex") return [];
  return spawns
    .filter((spawn) => isInsideLotusPondFootprint(spawn.position, TEMPLE_LAYOUT.pond.spawnClearance))
    .map((spawn) => `spawn "${spawn.id}" overlaps the lotus pond safety envelope`);
}
