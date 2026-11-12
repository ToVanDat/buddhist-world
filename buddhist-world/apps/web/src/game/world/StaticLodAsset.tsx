import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Group, LOD } from "three";
import type { RegionAssetDef } from "@bw/shared";

type LodAssetDef = NonNullable<RegionAssetDef["lods"]>[number];

/** Generic static LOD renderer for non-vegetation Hero Props and architecture. */
export function StaticLodAsset({ asset }: { asset: RegionAssetDef & { lods: [LodAssetDef, LodAssetDef, LodAssetDef] } }) {
  const near = useGLTF(asset.lods[0].src);
  const mid = useGLTF(asset.lods[1].src);
  const far = useGLTF(asset.lods[2].src);

  const lod = useMemo(() => {
    const root = new LOD();
    const sources = [near.scene, mid.scene, far.scene] as const;
    asset.lods.forEach((level, index) => {
      root.addLevel(sources[index]!.clone(true), level.distance, level.hysteresis ?? 0.08);
    });
    root.addLevel(new Group(), asset.cullDistance ?? 180, 0.05);
    root.name = `static-lod:${asset.id}`;
    root.autoUpdate = true;
    return root;
  }, [asset.id, asset.lods, asset.cullDistance, near.scene, mid.scene, far.scene]);

  return (
    <group
      position={asset.position ?? [0, 0, 0]}
      rotation={asset.rotation ?? [0, 0, 0]}
      scale={asset.scale ?? [1, 1, 1]}
    >
      <primitive object={lod} />
    </group>
  );
}
