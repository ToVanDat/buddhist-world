import { describe, expect, it } from "vitest";
import { getRegionAssetSources } from "./RegionContent";

describe("region asset retry cache keys", () => {
  it("includes the base GLB and every LOD URL exactly once", () => {
    expect(getRegionAssetSources({
      src: "/assets/temple.glb",
      lods: [
        { src: "/assets/temple-lod1.glb" },
        { src: "/assets/temple-lod2.glb" },
        { src: "/assets/temple-lod3.glb" },
      ],
    } as never)).toEqual([
      "/assets/temple.glb",
      "/assets/temple-lod1.glb",
      "/assets/temple-lod2.glb",
      "/assets/temple-lod3.glb",
    ]);
  });

  it("removes duplicate cache keys and supports assets without LODs", () => {
    expect(getRegionAssetSources({
      src: "/assets/tree.glb",
      lods: [{ src: "/assets/tree-lod1.glb" }, { src: "/assets/tree-lod1.glb" }],
    } as never)).toEqual(["/assets/tree.glb", "/assets/tree-lod1.glb"]);
    expect(getRegionAssetSources({ src: "/assets/rock.glb" } as never)).toEqual(["/assets/rock.glb"]);
  });
});
