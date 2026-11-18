import { describe, expect, it } from "vitest";
import { resolveActiveChunkIds } from "./chunkStreaming";
import type { RegionChunkDef } from "@bw/shared";
const chunks: RegionChunkDef[] = [
  { id: "near", bounds: { min: [-5, 0, -5], max: [5, 10, 5] }, loadRadius: 10, unloadRadius: 16 },
  { id: "priority", bounds: { min: [12, 0, -5], max: [18, 10, 5] }, loadRadius: 20, unloadRadius: 26, priority: 5 },
];
describe("region chunk streaming planner", () => {
  it("activates chunks within load radius", () => { expect(resolveActiveChunkIds([10, 5, 0], chunks, new Set())).toEqual(["priority", "near"]); });
  it("retains active chunks until unload radius is crossed", () => {
    expect(resolveActiveChunkIds([18, 5, 0], chunks, new Set(["near"]))).toContain("near");
    expect(resolveActiveChunkIds([18, 5, 0], chunks, new Set())).not.toContain("near");
  });
  it("orders by priority then distance", () => { expect(resolveActiveChunkIds([10, 5, 0], chunks, new Set())[0]).toBe("priority"); });
  it("does not activate distant chunks", () => { expect(resolveActiveChunkIds([100, 5, 100], chunks, new Set())).toEqual([]); });
});


  it("bounds the number of active chunk groups and keeps priority ordering", () => {
    const many: RegionChunkDef[] = Array.from({ length: 6 }, (_, index) => ({
      id: "chunk-" + index,
      bounds: { min: [-5, 0, -5], max: [5, 10, 5] },
      loadRadius: 20,
      unloadRadius: 30,
      priority: index,
    }));
    expect(resolveActiveChunkIds([0, 1, 0], many, new Set(), 2)).toEqual(["chunk-5", "chunk-4"]);
  });
