import { describe, expect, it } from "vitest";
import { resolveNpcInteractionPosition } from "./npcInteractionPosition.js";

describe("resolveNpcInteractionPosition", () => {
  const fallback: [number, number, number] = [1, 1.2, 2];
  it("uses the live scheduled position in the same region", () => {
    expect(resolveNpcInteractionPosition(fallback, { regionId: "temple_complex", position: [4, 1.2, 5] }, "temple_complex", true)).toEqual([4, 1.2, 5]);
  });
  it("rejects a live NPC position belonging to another region", () => {
    expect(resolveNpcInteractionPosition(fallback, { regionId: "garden", position: [4, 1.2, 5] }, "temple_complex", true)).toBeNull();
  });
  it("rejects a scheduled NPC without an active live position", () => {
    expect(resolveNpcInteractionPosition(fallback, undefined, "temple_complex", true)).toBeNull();
  });
  it("keeps the authored fallback for an NPC without a schedule", () => {
    expect(resolveNpcInteractionPosition(fallback, undefined, "temple_complex", false)).toEqual(fallback);
  });
  it("rejects malformed live and fallback coordinates", () => {
    expect(resolveNpcInteractionPosition(fallback, { regionId: "temple_complex", position: [Number.NaN, 0, 0] }, "temple_complex", true)).toBeNull();
    expect(resolveNpcInteractionPosition([Number.POSITIVE_INFINITY, 0, 0], undefined, "temple_complex", false)).toBeNull();
  });
});
