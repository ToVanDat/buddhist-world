import { describe, expect, it } from "vitest";
import { getRegionAssetSources, haveRegionAssetSourcesChanged } from "./regionAssetSources";

describe("region asset retry cache keys", () => {
  it("includes the base GLB and every LOD URL exactly once", () => {
    expect(getRegionAssetSources({
      src: "/assets/temple.glb",
      lods: [
        { src: "/assets/temple-lod1.glb" },
        { src: "/assets/temple-lod2.glb" },
        { src: "/assets/temple-lod3.glb" },
      ],
    })).toEqual([
      "/assets/temple.glb",
      "/assets/temple-lod1.glb",
      "/assets/temple-lod2.glb",
      "/assets/temple-lod3.glb",
    ]);
  });

  it("detects LOD manifest changes even when the base GLB stays the same", () => {
    expect(haveRegionAssetSourcesChanged(
      { src: "/assets/tree.glb", lods: [{ src: "/assets/tree-lod1.glb" }] },
      { src: "/assets/tree.glb", lods: [{ src: "/assets/tree-lod2.glb" }] },
    )).toBe(true);
    expect(haveRegionAssetSourcesChanged(
      { src: "/assets/tree.glb" },
      { src: "/assets/tree.glb" },
    )).toBe(false);
  });

  it("removes duplicate cache keys and supports assets without LODs", () => {
    expect(getRegionAssetSources({
      src: "/assets/tree.glb",
      lods: [{ src: "/assets/tree-lod1.glb" }, { src: "/assets/tree-lod1.glb" }],
    })).toEqual(["/assets/tree.glb", "/assets/tree-lod1.glb"]);
    expect(getRegionAssetSources({ src: "/assets/rock.glb" })).toEqual(["/assets/rock.glb"]);
  });
});
