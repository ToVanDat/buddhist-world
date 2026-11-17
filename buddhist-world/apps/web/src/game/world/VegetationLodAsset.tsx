import { Suspense, useCallback, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Group, Vector3 } from "three";
import { WindSway } from "../lighting/WindSway";
import { VertexWind } from "../lighting/VertexWind";
import type { RegionAssetDef } from "@bw/shared";
import { resolveAssetLodLevel } from "./assetQuality";

type LodAssetDef = NonNullable<RegionAssetDef["lods"]>[number];

function VegetationLodModel({ src, phase, onLoaded }: { src: string; phase: number; onLoaded?: () => void }) {
  const { scene } = useGLTF(src);
  const instance = useMemo(() => scene.clone(true), [scene]);
  const loaded = useRef(false);
  if (onLoaded && !loaded.current) {
    loaded.current = true;
    queueMicrotask(onLoaded);
  }
  return (
    <WindSway amplitude={0.022} phase={phase}>
      <VertexWind object={instance} amplitude={0.028} />
    </WindSway>
  );
}

/** Progressive vegetation LOD loading; wind is applied only to the active level. */
export function VegetationLodAsset({ asset }: { asset: RegionAssetDef & { lods: [LodAssetDef, LodAssetDef, LodAssetDef] } }) {
  const rootRef = useRef<Group>(null);
  const assetPosition = useMemo(() => new Vector3(), []);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const requestedRef = useRef(0);
  const [requestedLevel, setRequestedLevel] = useState(0);
  const [displayedLevel, setDisplayedLevel] = useState(0);
  const cullDistance = asset.cullDistance ?? 240;
  const phase = asset.id.length * 0.37;
  const onLoaded = useCallback(() => setDisplayedLevel(requestedLevel), [requestedLevel]);

  useFrame(({ camera }) => {
    if (!rootRef.current) return;
    rootRef.current.getWorldPosition(assetPosition);
    camera.getWorldPosition(cameraPosition);
    const distance = cameraPosition.distanceTo(assetPosition);
    const next = resolveAssetLodLevel(distance, requestedRef.current, asset.lods, cullDistance);
    if (next !== requestedRef.current) {
      requestedRef.current = next;
      setRequestedLevel(next);
    }
  });

  const transform = {
    position: asset.position ?? [0, 0, 0] as [number, number, number],
    rotation: asset.rotation ?? [0, 0, 0] as [number, number, number],
    scale: asset.scale ?? [1, 1, 1] as [number, number, number],
  };
  const displayed = asset.lods[Math.max(0, displayedLevel)]!;
  const requested = requestedLevel >= 0 ? asset.lods[requestedLevel]! : null;

  return (
    <group ref={rootRef} position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      {requested && requestedLevel === displayedLevel ? (
        <VegetationLodModel src={requested.src} phase={phase} />
      ) : requested ? (
        <Suspense fallback={<VegetationLodModel src={displayed.src} phase={phase} />}>
          <VegetationLodModel key={requestedLevel} src={requested.src} phase={phase} onLoaded={onLoaded} />
        </Suspense>
      ) : null}
    </group>
  );
}
