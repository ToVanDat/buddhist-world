import { describe, expect, it } from "vitest";
import { REGIONS, validateRegionManifest } from "@bw/shared";

describe("validateRegionManifest", () => {
  it("accepts the current shared region manifest", () => {
    expect(validateRegionManifest(REGIONS)).toEqual([]);
  });
  it.each([null, undefined, [], "not-an-object"])("returns an issue for malformed root input", (input) => {
    expect(validateRegionManifest(input)[0]).toMatchObject({ regionId: "<manifest>", path: "regions" });
  });
  it("does not throw for null or structurally incomplete region entries", () => {
    const input = { temple_complex: null, broken: { id: "broken" } };
    expect(() => validateRegionManifest(input)).not.toThrow();
    const issues = validateRegionManifest(input);
    expect(issues.some((issue) => issue.regionId === "temple_complex")).toBe(true);
    expect(issues.some((issue) => issue.path === "bounds")).toBe(true);
  });
  it("does not compare chunk bounds against invalid region bounds", () => {
    const issues = validateRegionManifest({
      bad_bounds: {
        id: "bad_bounds", name: "Broken", bounds: { min: [0, 0], max: [10, 10, 10] },
        spawns: [], defaultSpawn: "missing", assets: [],
        chunks: [{ id: "chunk-a", bounds: { min: [1, 0, 1], max: [2, 2, 2] }, loadRadius: 10, unloadRadius: 20 }],
      },
    });
    expect(issues.some((issue) => issue.path === "bounds")).toBe(true);
    expect(issues.some((issue) => issue.path === "chunks[0].bounds")).toBe(false);
  });
  it("reports malformed vectors, non-finite values and duplicate spawn ids", () => {
    const issues = validateRegionManifest({
      test: {
        id: "test", name: "Test", bounds: { min: [0, 0, 0], max: [0, Number.POSITIVE_INFINITY, 10] },
        spawns: [
          { id: "spawn", name: "A", description: "", position: [0, 0, 0], yaw: 0 },
          { id: "spawn", name: "B", description: "", position: [0, 0], yaw: Number.NaN },
        ],
        defaultSpawn: "missing", assets: [],
      },
    });
    expect(issues.some((issue) => issue.path === "bounds")).toBe(true);
    expect(issues.some((issue) => issue.path === "spawns[1].id")).toBe(true);
    expect(issues.some((issue) => issue.path === "spawns[1].position")).toBe(true);
    expect(issues.some((issue) => issue.path === "spawns[1].yaw")).toBe(true);
    expect(issues.some((issue) => issue.path === "defaultSpawn")).toBe(true);
  });
  it("rejects asset and instance origins outside region and non-positive scales", () => {
    const issues = validateRegionManifest({
      test: {
        id: "test", name: "Test", bounds: { min: [0, 0, 0], max: [10, 10, 10] },
        spawns: [{ id: "spawn", name: "A", description: "", position: [1, 1, 1], yaw: 0 }],
        defaultSpawn: "spawn",
        assets: [{
          id: "tree", src: "/assets/models/tree.glb", position: [12, 0, 2], scale: [1, 0, 1],
          collision: false, instances: [{ position: [-1, 0, 2], scale: [1, -1, 1] }],
        }],
      },
    });
    expect(issues.some((issue) => issue.path === "assets[0].position" && issue.message.includes("outside region"))).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[0].scale" && issue.message.includes("positive"))).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[0].instances[0].position" && issue.message.includes("outside region"))).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[0].instances[0].scale" && issue.message.includes("positive"))).toBe(true);
  });

  it("rejects overlapping authored asset footprints and spawn points inside occupied volumes", () => {
    const issues = validateRegionManifest({
      test: {
        id: "test", name: "Test", bounds: { min: [0, 0, 0], max: [20, 10, 20] },
        spawns: [
          { id: "spawn-inside", name: "Inside", description: "", position: [3, 1, 3], yaw: 0 },
          { id: "spawn-clear", name: "Clear", description: "", position: [1, 1, 1], yaw: 0 },
        ],
        defaultSpawn: "spawn-clear",
        assets: [
          { id: "hall", src: "/assets/models/hall.glb", occupiedBounds: { min: [2, 0, 2], max: [6, 6, 6] } },
          { id: "tree", src: "/assets/models/tree.glb", occupiedBounds: { min: [5, 0, 5], max: [8, 4, 8] } },
        ],
      },
    });
    expect(issues.some((issue) => issue.path === "spawns[0].position" && issue.message.includes("inside an asset occupied volume"))).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[1].occupiedBounds" && issue.message.includes("overlaps"))).toBe(true);
  });

  it("rejects occupied bounds outside the region and malformed bounds", () => {
    const issues = validateRegionManifest({
      test: {
        id: "test", name: "Test", bounds: { min: [0, 0, 0], max: [10, 10, 10] },
        spawns: [{ id: "spawn", name: "A", description: "", position: [1, 1, 1], yaw: 0 }],
        defaultSpawn: "spawn",
        assets: [
          { id: "outside", src: "/assets/models/outside.glb", occupiedBounds: { min: [-1, 0, 0], max: [2, 2, 2] } },
          { id: "bad", src: "/assets/models/bad.glb", occupiedBounds: { min: [2, 2, 2], max: [1, 1, 1] } },
        ],
      },
    });
    expect(issues.some((issue) => issue.path === "assets[0].occupiedBounds" && issue.message.includes("outside region"))).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[1].occupiedBounds" && issue.message.includes("finite, non-empty"))).toBe(true);
  });

  it("checks chunk containment and radius hysteresis with valid region bounds", () => {
    const issues = validateRegionManifest({
      test: {
        id: "test", name: "Test", bounds: { min: [0, 0, 0], max: [10, 10, 10] },
        spawns: [{ id: "spawn", name: "A", description: "", position: [1, 1, 1], yaw: 0 }],
        defaultSpawn: "spawn", assets: [],
        chunks: [{ id: "chunk", bounds: { min: [-1, 0, 0], max: [2, 2, 2] }, loadRadius: 2, unloadRadius: 1 }],
      },
    });
    expect(issues.some((issue) => issue.message.includes("contained by region bounds"))).toBe(true);
    expect(issues.some((issue) => issue.path.endsWith("unloadRadius"))).toBe(true);
  });
});