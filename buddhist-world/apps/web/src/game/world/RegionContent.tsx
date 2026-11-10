import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import { DEFAULT_REGION_ID, getRegion, type RegionAssetDef } from "@bw/shared";
import { TempleRegion } from "./TempleRegion";
import { NpcActors } from "../characters/NpcActors";
import { WaypointMarker } from "./WaypointMarker";
import { WorldInteractionProps } from "./WorldInteractionProps";
import { VegetationLodAsset } from "./VegetationLodAsset";
import { InstancedVegetationAsset } from "./InstancedVegetationAsset";

/** Assets are loaded only while their owning region is active. */
function RegionAsset({ asset }: { asset: RegionAssetDef }) {
  if (asset.collision === false && asset.lods) {
    return <VegetationLodAsset asset={asset as RegionAssetDef & { lods: [NonNullable<RegionAssetDef["lods"]>[number], NonNullable<RegionAssetDef["lods"]>[number], NonNullable<RegionAssetDef["lods"]>[number]] }} />;
  }
  if (asset.collision === false && asset.instances?.length) {
    return <InstancedVegetationAsset asset={asset as RegionAssetDef & { instances: NonNullable<RegionAssetDef["instances"]> }} />;
  }
  return <StaticRegionAsset asset={asset} />;
}

function StaticRegionAsset({ asset }: { asset: RegionAssetDef }) {
  const { scene } = useGLTF(asset.src);
  const instance = useMemo(() => scene.clone(true), [scene]);
  const transform = {
    position: asset.position ?? [0, 0, 0] as [number, number, number],
    rotation: asset.rotation ?? [0, 0, 0] as [number, number, number],
    scale: asset.scale ?? [1, 1, 1] as [number, number, number],
  };
  return (
    <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      {asset.collision === false
        ? <primitive object={instance} visible={asset.render !== false} />
        : <RigidBody type="fixed" colliders="trimesh">
            <primitive object={instance} visible={asset.render !== false} />
          </RigidBody>}
    </group>
  );
}

export function RegionContent({ regionId }: { regionId: string }) {
  const region = getRegion(regionId);
  if (!region) return null;

  const showBlockout = region.blockout ?? regionId === DEFAULT_REGION_ID;
  return (
    <group name={`region:${region.id}`}>
      {showBlockout && regionId === DEFAULT_REGION_ID && <TempleRegion />}
      <WaypointMarker regionId={regionId} />
      <WorldInteractionProps regionId={regionId} />
      <NpcActors regionId={regionId} />
      {region.assets.map((asset) => <RegionAsset key={asset.id} asset={asset} />)}
    </group>
  );
}
