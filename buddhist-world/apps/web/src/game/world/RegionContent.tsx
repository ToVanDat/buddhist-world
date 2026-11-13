import { Component, useEffect, useMemo, type ErrorInfo, type ReactNode } from "react";
import { RigidBody } from "@react-three/rapier";
import { useGLTF } from "@react-three/drei";
import { DEFAULT_REGION_ID, getRegion, REGIONS, validateRegionManifest, type RegionAssetDef } from "@bw/shared";
import { TempleRegion } from "./TempleRegion";
import { NpcActors } from "../characters/NpcActors";
import { WaypointMarker } from "./WaypointMarker";
import { WorldInteractionProps } from "./WorldInteractionProps";
import { VegetationLodAsset } from "./VegetationLodAsset";
import { StaticLodAsset } from "./StaticLodAsset";
import { InstancedVegetationAsset } from "./InstancedVegetationAsset";
import { TempleArchitecturalLights } from "./TempleArchitecturalLights";
import { WindSway } from "../lighting/WindSway";
import { VertexWind } from "../lighting/VertexWind";
import { BranchBoneWind } from "../lighting/BranchBoneWind";

interface RegionAssetBoundaryProps {
  asset: RegionAssetDef;
  children: ReactNode;
}

interface RegionAssetBoundaryState {
  failed: boolean;
}

/**
 * Isolates a failed GLB/Suspense load so one optional region asset cannot take
 * down the complete world scene. Development gets a visible wireframe proxy;
 * production safely omits the failed asset and reports its identity.
 */
class RegionAssetBoundary extends Component<RegionAssetBoundaryProps, RegionAssetBoundaryState> {
  state: RegionAssetBoundaryState = { failed: false };

  static getDerivedStateFromError(): RegionAssetBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      `[Buddhist World] Failed to load region asset "${this.props.asset.id}" (${this.props.asset.src}).`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (!import.meta.env.DEV) return null;

    const asset = this.props.asset;
    return (
      <mesh
        name={`missing-asset-proxy:${asset.id}`}
        position={asset.position ?? [0, 0, 0]}
        rotation={asset.rotation ?? [0, 0, 0]}
        scale={asset.scale ?? [1, 1, 1]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ff00ff" wireframe />
      </mesh>
    );
  }
}

/** Assets are loaded only while their owning region is active. */
function RegionAsset({ asset, phase }: { asset: RegionAssetDef; phase: number }) {
  if (asset.collision === false && asset.lods) {
    const withLods = asset as RegionAssetDef & { lods: [NonNullable<RegionAssetDef["lods"]>[number], NonNullable<RegionAssetDef["lods"]>[number], NonNullable<RegionAssetDef["lods"]>[number]] };
    const isFoliage = /vegetation|tree|bodhi|bamboo|shrub|foliage/i.test(asset.id);
    return isFoliage
      ? <VegetationLodAsset asset={withLods} />
      : <StaticLodAsset asset={withLods} />;
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
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const issues = validateRegionManifest(REGIONS);
    if (issues.length) {
      console.groupCollapsed(`[Buddhist World] Region manifest: ${issues.length} issue(s)`);
      for (const issue of issues) {
        console.warn(`[${issue.regionId}] ${issue.path}: ${issue.message}`);
      }
      console.groupEnd();
    }
    const region = REGIONS[regionId];
    if (region && region.assets.length === 0 && region.blockout) {
      console.info(`[Buddhist World] Region "${regionId}" is running with its documented blockout; production GLB assets are not registered yet.`);
    }
  }, [regionId]);

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
        <RegionAssetBoundary key={asset.id} asset={asset}>
          <RegionAsset asset={asset} phase={index * 1.173} />
        </RegionAssetBoundary>
      ))}
    </group>
  );
}
