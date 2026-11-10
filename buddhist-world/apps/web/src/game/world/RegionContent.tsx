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
import { TempleArchitecturalLights } from "./TempleArchitecturalLights";
import { WindSway } from "../lighting/WindSway";
import { VertexWind } from "../lighting/VertexWind";
import { BranchBoneWind } from "../lighting/BranchBoneWind";

/** Assets are loaded only while their owning region is active. */
function RegionAsset({ asset, phase }: { asset: RegionAssetDef; phase: number }) {
  if (asset.collision === false && asset.lods) {
    return <VegetationLodAsset asset={asset as RegionAssetDef & { lods: [NonNullable<RegionAssetDef["lods"]>[number], NonNullable<RegionAssetDef["lods"]>[number], NonNullable<RegionAssetDef["lods"]>[number]] }} />;
  }
  if (asset.collision === false && asset.instances?.length) {
    return <InstancedVegetationAsset asset={asset as RegionAssetDef & { instances: NonNullable<RegionAssetDef["instances"]> }} />;
  }
  return <StaticRegionAsset asset={asset} phase={phase} />;
}

function StaticRegionAsset({ asset, phase }: { asset: RegionAssetDef; phase: number }) {
  const { scene } = useGLTF(asset.src);
  const instance = useMemo(() => scene.clone(true), [scene]);
  const transform = {
    position: asset.position ?? [0, 0, 0] as [number, number, number],
    rotation: asset.rotation ?? [0, 0, 0] as [number, number, number],
    scale: asset.scale ?? [1, 1, 1] as [number, number, number],
  };
  const isFoliage = asset.collision === false && /vegetation|tree|bodhi|bamboo|shrub|foliage/i.test(asset.id);
  const hasBranchRig = isFoliage && instance.getObjectByProperty("isSkinnedMesh", true) !== undefined;
  instance.visible = asset.render !== false;
  return (
    <group position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      {asset.collision === false
        ? isFoliage
          ? hasBranchRig
            ? <BranchBoneWind object={scene} amplitude={0.18} />
            : <WindSway amplitude={0.025} phase={phase}><VertexWind object={instance} amplitude={0.035} /></WindSway>
          : <primitive object={instance} />
        : <RigidBody type="fixed" colliders="trimesh">
            <primitive object={instance} />
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
      {regionId === DEFAULT_REGION_ID && <TempleArchitecturalLights />}
      {region.assets.map((asset, index) => (
        <RegionAsset key={asset.id} asset={asset} phase={index * 1.173} />
      ))}
    </group>
  );
}
