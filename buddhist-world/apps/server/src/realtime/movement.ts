import {
  MAX_HORIZONTAL_SPEED, MAX_VERTICAL_SPEED, SPEED_TOLERANCE,
  type RegionDef, type Vec3,
} from "@bw/shared";

export type MoveVerdict =
  | { ok: true; position: Vec3 }
  | { ok: false; reason: "out_of_bounds" | "too_fast"; position: Vec3 };

const clampDt = (dt: number) => Math.min(Math.max(dt, 0.02), 1.0);

/** Kiểm tra vị trí lưu cũ có hữu hạn và còn nằm trong region trước khi dùng làm spawn. */
export function isPositionInBounds(region: RegionDef, position: readonly number[]): position is Vec3 {
  if (position.length !== 3 || !position.every(Number.isFinite)) return false;
  const { min, max } = region.bounds;
  return position.every((value, index) => value >= min[index]! && value <= max[index]!);
}

/** Kiểm tra bước di chuyển client báo cáo. Nếu sai, trả về vị trí hợp lệ cuối cùng để sửa. */
export function validateMove(region: RegionDef, last: Vec3, next: Vec3, dtSec: number): MoveVerdict {
  if (!isPositionInBounds(region, next)) return { ok: false, reason: "out_of_bounds", position: last };
  const dt = clampDt(dtSec);
  const horiz = Math.hypot(next[0] - last[0], next[2] - last[2]) / dt;
  const vert = Math.abs(next[1] - last[1]) / dt;
  if (horiz > MAX_HORIZONTAL_SPEED * SPEED_TOLERANCE || vert > MAX_VERTICAL_SPEED * SPEED_TOLERANCE) {
    return { ok: false, reason: "too_fast", position: last };
  }
  return { ok: true, position: next };
}

export const distance2D = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[2] - b[2]);
