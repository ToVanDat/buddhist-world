import { describe, it, expect } from "vitest";
import { REGIONS } from "@bw/shared";
import { validateMove } from "./movement.js";

const region = REGIONS.temple_complex!;
describe("validateMove", () => {
  it("chấp nhận bước đi bình thường", () => {
    expect(validateMove(region, [0, 1, 0], [0.5, 1, 0], 0.1).ok).toBe(true);
  });
  it("từ chối teleport", () => {
    const v = validateMove(region, [0, 1, 0], [50, 1, 0], 0.1);
    expect(v.ok).toBe(false);
    if (!v.ok) { expect(v.reason).toBe("too_fast"); expect(v.position).toEqual([0, 1, 0]); }
  });
  it("từ chối ra ngoài ranh giới region", () => {
    const v = validateMove(region, [119, 1, 0], [121, 1, 0], 1);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("out_of_bounds");
  });
  it("không cho gian lận bằng dt rất lớn", () => {
    expect(validateMove(region, [0, 1, 0], [50, 1, 0], 9999).ok).toBe(false);
  });
});
