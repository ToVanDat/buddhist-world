import { INTEREST_RADIUS_M, type Vec3 } from "@bw/shared";
import { distance2D } from "./movement.js";

export interface InterestPlayer {
  pos: Vec3;
}

export type InterestIndex<T extends InterestPlayer> = Map<string, T[]>;

const cellKey = (x: number, z: number) => `${x}:${z}`;

/** Spatial hash theo mặt phẳng XZ; mỗi người chơi chỉ được đưa vào một cell. */
export function buildInterestIndex<T extends InterestPlayer>(
  players: readonly T[],
  cellSize = INTEREST_RADIUS_M,
): InterestIndex<T> {
  const size = Math.max(1, cellSize);
  const index: InterestIndex<T> = new Map();
  for (const player of players) {
    const x = Math.floor(player.pos[0] / size);
    const z = Math.floor(player.pos[2] / size);
    const key = cellKey(x, z);
    const bucket = index.get(key);
    if (bucket) bucket.push(player);
    else index.set(key, [player]);
  }
  return index;
}

/** Chỉ xét 9 cell lân cận rồi lọc theo bán kính thật, tránh duyệt toàn bộ region cho mỗi socket. */
export function findNearbyPlayers<T extends InterestPlayer>(
  player: T,
  index: InterestIndex<T>,
  radius = INTEREST_RADIUS_M,
): T[] {
  const size = Math.max(1, radius);
  const cellX = Math.floor(player.pos[0] / size);
  const cellZ = Math.floor(player.pos[2] / size);
  const nearby: T[] = [];

  for (let x = cellX - 1; x <= cellX + 1; x++) {
    for (let z = cellZ - 1; z <= cellZ + 1; z++) {
      for (const candidate of index.get(cellKey(x, z)) ?? []) {
        if (candidate !== player && distance2D(player.pos, candidate.pos) <= radius) {
          nearby.push(candidate);
        }
      }
    }
  }
  return nearby;
}
