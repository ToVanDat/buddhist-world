import { useMemo } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import { DEFAULT_REGION_ID, getRegion } from "@bw/shared";
import { TempleRegion } from "./TempleRegion";

/** Each asset is mounted only while its owning region is active. */
function RegionAsset({ src }: { src: string }) {
  const { scene } = useGLTF(src);
  const instance = useMemo(() => scene.clone(true), [scene]);
  return (
    <RigidBody type="fixed" colliders="trimesh">
      <primitive object={instance} />
    </RigidBody>
  );
}

export function RegionContent({ regionId }: { regionId: string }) {
  const region = getRegion(regionId);
  if (!region) return null;

  if (region.assets.length === 0) {
    return regionId === DEFAULT_REGION_ID ? <TempleRegion /> : null;
  }

  return (
    <group name={`region:${region.id}`}>
      {region.assets.map((src) => <RegionAsset key={src} src={src} />)}
    </group>
  );
}
