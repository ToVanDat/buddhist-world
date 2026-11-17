import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Group, Vector3 } from "three";
import type { RegionAssetDef } from "@bw/shared";
import { resolveAssetLodLevel } from "./assetQuality";

type LodAssetDef = NonNullable<RegionAssetDef["lods"]>[number];

function StaticLodModel({ src, onLoaded }: { src: string; onLoaded?: () => void }) {
  const { scene } = useGLTF(src);
  const instance = useMemo(() => scene.clone(true), [scene]);
  useEffect(() => { onLoaded?.(); }, [onLoaded, src]);
  return <primitive object={instance} />;
}

/**
 * Loads only the currently selected GLB level. The previous level stays visible
 * while the next level is fetched, instead of downloading all three on mount.
 */
export function StaticLodAsset({ asset }: { asset: RegionAssetDef & { lods: [LodAssetDef, LodAssetDef, LodAssetDef] } }) {
  const rootRef = useRef<Group>(null);
  const assetPosition = useMemo(() => new Vector3(), []);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const requestedRef = useRef(0);
  const [requestedLevel, setRequestedLevel] = useState(0);
  const [displayedLevel, setDisplayedLevel] = useState(0);
  const cullDistance = asset.cullDistance ?? 180;
  const onLoaded = useCallback(() => {
    if (requestedRef.current === requestedLevel) setDisplayedLevel(requestedLevel);
  }, [requestedLevel]);

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
    <group ref={rootRef} visible={asset.render !== false} position={transform.position} rotation={transform.rotation} scale={transform.scale}>
      {requested && requestedLevel === displayedLevel ? (
        <StaticLodModel src={requested.src} />
      ) : requested ? (
        <Suspense fallback={<StaticLodModel src={displayed.src} />}>
          <StaticLodModel key={requestedLevel} src={requested.src} onLoaded={onLoaded} />
        </Suspense>
      ) : null}
    </group>
  );
}
