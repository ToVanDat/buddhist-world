import { describe, expect, it } from "vitest";
import { REGIONS, validateRegionManifest } from "@bw/shared";

describe("validateRegionManifest", () => {
  it("accepts the current authored region manifest", () => {
    expect(validateRegionManifest(REGIONS)).toEqual([]);
  });

  it("reports invalid spawn, default spawn, asset path and LOD metadata", () => {
    const regions = structuredClone(REGIONS);
    const region = regions.temple_complex;
    region.spawns[0]!.position = [Number.NaN, 1, 2];
    region.defaultSpawn = "missing_spawn";
    region.assets.push({
      id: "broken_asset",
      src: "assets/not-a-glb.gltf",
      lods: [
        { src: "/assets/lod-near.glb", distance: 0 },
        { src: "/assets/lod-mid.glb", distance: 20 },
        { src: "/assets/lod-far.glb", distance: 10 },
      ],
    });

    const issues = validateRegionManifest(regions);
    expect(issues.some((issue) => issue.path === "spawns[0].position")).toBe(true);
    expect(issues.some((issue) => issue.path === "defaultSpawn")).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[0].src")).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[0].lods[0].distance")).toBe(true);
    expect(issues.some((issue) => issue.path === "assets[0].lods[2].distance")).toBe(true);
  });

  it("reports duplicate spawn and asset identifiers", () => {
    const regions = structuredClone(REGIONS);
    const region = regions.temple_complex;
    region.spawns.push({ ...region.spawns[0]!, position: [1, 1, 1] });
    region.assets = [
      { id: "tree", src: "/assets/tree-a.glb" },
      { id: "tree", src: "/assets/tree-b.glb" },
    ];

    const issues = validateRegionManifest(regions);
    expect(issues.some((issue) => issue.message.includes("duplicate spawn id"))).toBe(true);
    expect(issues.some((issue) => issue.message.includes("duplicate asset id"))).toBe(true);
  });
});
