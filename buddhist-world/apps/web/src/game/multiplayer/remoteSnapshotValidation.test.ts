import { describe, expect, it } from "vitest";
import { getRegion } from "@bw/shared";
import { validateRemotePlayerSnapshots } from "./remoteSnapshotValidation";

const region = getRegion("temple_complex")!;
const valid = {
  id: "player-1", name: "Player", p: [...region.spawns[0]!.position] as [number, number, number],
  yaw: 0, anim: "idle" as const,
};

describe("remote snapshot validation", () => {
  it("accepts finite snapshots inside the active region", () => {
    expect(validateRemotePlayerSnapshots([valid], region.id)).toEqual([valid]);
  });

  it("rejects snapshots outside the active region bounds", () => {
    const outside = { ...valid, id: "outside", p: [region.bounds.max[0] + 10, 1, 0] };
    expect(validateRemotePlayerSnapshots([outside], region.id)).toEqual([]);
  });

  it("rejects malformed coordinates and unknown regions", () => {
    expect(validateRemotePlayerSnapshots([{ ...valid, p: [0, Number.NaN, 0] }], region.id)).toEqual([]);
    expect(validateRemotePlayerSnapshots([valid], "unknown-region")).toEqual([]);
    expect(validateRemotePlayerSnapshots([valid], null)).toEqual([]);
  });

  it("deduplicates player IDs in one snapshot", () => {
    expect(validateRemotePlayerSnapshots([valid, { ...valid, name: "Duplicate" }], region.id)).toEqual([valid]);
  });

  it("rejects oversized or blank remote identity fields", () => {
    expect(validateRemotePlayerSnapshots([{ ...valid, id: "x".repeat(129) }], region.id)).toEqual([]);
    expect(validateRemotePlayerSnapshots([{ ...valid, name: " ".repeat(3) }], region.id)).toEqual([]);
    expect(validateRemotePlayerSnapshots([{ ...valid, name: "x".repeat(33) }], region.id)).toEqual([]);
  });

  it("rejects unsupported animation and invalid facing direction", () => {
    expect(validateRemotePlayerSnapshots([{ ...valid, anim: "teleport" }], region.id)).toEqual([]);
    expect(validateRemotePlayerSnapshots([{ ...valid, yaw: Number.NaN }], region.id)).toEqual([]);
  });
});
