import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Group, LOD } from "three";
import type { RegionAssetDef } from "@bw/shared";

type LodAssetDef = NonNullable<RegionAssetDef["lods"]>[number];

/**
 * Static vegetation LOD renderer.
 * All variants are scoped to the active region by RegionContent. Three.js selects
 * one level by camera distance and applies its normal frustum culling.
 */
export function VegetationLodAsset({ asset }: { asset: RegionAssetDef & { lods: [LodAssetDef, LodAssetDef, LodAssetDef] } }) {
  const low = useGLTF(asset.lods[0].src);
  const medium = useGLTF(asset.lods[1].src);
  const far = useGLTF(asset.lods[2].src);

  const lodObject = useMemo(() => {
    const lod = new LOD();
    const variants = [low.scene, medium.scene, far.scene] as const;
    asset.lods.forEach((level, index) => {
      const source = variants[index]!;
      const instance = source.clone(true);
      lod.addLevel(instance, level.distance, level.hysteresis ?? 0.08);
    });
    // A final empty level avoids rendering vegetation beyond its useful horizon.
    lod.addLevel(new Group(), asset.cullDistance ?? 240, 0.05);
    lod.name = `vegetation-lod:${asset.id}`;
    lod.autoUpdate = true;
    return lod;
  }, [asset.id, asset.lods, asset.cullDistance, low.scene, medium.scene, far.scene]);

  return (
    <group
      position={asset.position ?? [0, 0, 0]}
      rotation={asset.rotation ?? [0, 0, 0]}
      scale={asset.scale ?? [1, 1, 1]}
    >
      <primitive object={lodObject} />
    </group>
  );
}
