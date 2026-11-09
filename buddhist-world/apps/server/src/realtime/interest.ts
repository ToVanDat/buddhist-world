import { INTEREST_RADIUS_M, type Vec3 } from "@bw/shared";
import { distance2D } from "./movement.js";

export interface InterestPlayer {
  pos: Vec3;
}

export interface InterestIndex<T extends InterestPlayer> {
  cellSize: number;
  cells: Map<string, T[]>;
}

const cellKey = (x: number, z: number) => `${x}:${z}`;

/** Spatial hash theo mặt phẳng XZ; mỗi người chơi chỉ được đưa vào một cell. */
export function buildInterestIndex<T extends InterestPlayer>(
  players: readonly T[],
  cellSize = INTEREST_RADIUS_M,
): InterestIndex<T> {
  const size = Math.max(1, cellSize);
  const cells: Map<string, T[]> = new Map();
  for (const player of players) {
    const x = Math.floor(player.pos[0] / size);
    const z = Math.floor(player.pos[2] / size);
    const key = cellKey(x, z);
    const bucket = cells.get(key);
    if (bucket) bucket.push(player);
    else cells.set(key, [player]);
  }
  return { cellSize: size, cells };
}

/** Chỉ xét các cell giao với bán kính quan tâm rồi lọc theo khoảng cách thật. */
export function findNearbyPlayers<T extends InterestPlayer>(
  player: T,
  index: InterestIndex<T>,
  radius = INTEREST_RADIUS_M,
): T[] {
  const cellX = Math.floor(player.pos[0] / index.cellSize);
  const cellZ = Math.floor(player.pos[2] / index.cellSize);
  const cellRadius = Math.ceil(radius / index.cellSize);
  const nearby: T[] = [];

  for (let x = cellX - cellRadius; x <= cellX + cellRadius; x++) {
    for (let z = cellZ - cellRadius; z <= cellZ + cellRadius; z++) {
      for (const candidate of index.cells.get(cellKey(x, z)) ?? []) {
        if (candidate !== player && distance2D(player.pos, candidate.pos) <= radius) {
          nearby.push(candidate);
        }
      }
    }
  }
  return nearby;
}
