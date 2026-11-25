import { describe, expect, it } from "vitest";
import { getRegionAssetSources } from "./regionAssetSources";

describe("region asset retry cache keys", () => {
  it("includes the base GLB and every LOD URL exactly once", () => {
    expect(getRegionAssetSources({
      src: "/assets/temple.glb",
      lods: [
        { src: "/assets/temple-lod1.glb", distance: 10 },
        { src: "/assets/temple-lod2.glb", distance: 20 },
        { src: "/assets/temple-lod3.glb", distance: 30 },
      ],
    })).toEqual([
      "/assets/temple.glb",
      "/assets/temple-lod1.glb",
      "/assets/temple-lod2.glb",
      "/assets/temple-lod3.glb",
    ]);
  });

  it("removes duplicate cache keys and supports assets without LODs", () => {
    expect(getRegionAssetSources({
      src: "/assets/tree.glb",
      lods: [{ src: "/assets/tree-lod1.glb", distance: 10 }, { src: "/assets/tree-lod1.glb", distance: 20 }],
    })).toEqual(["/assets/tree.glb", "/assets/tree-lod1.glb"]);
    expect(getRegionAssetSources({ src: "/assets/rock.glb" })).toEqual(["/assets/rock.glb"]);
  });
});
