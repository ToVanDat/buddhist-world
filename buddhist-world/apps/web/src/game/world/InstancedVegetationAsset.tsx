import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Mesh } from "three";
import type { RegionAssetDef } from "@bw/shared";

type InstanceTransform = NonNullable<RegionAssetDef["instances"]>[number];

/** Builds one GPU InstancedMesh per source GLB mesh/material, with per-instance transforms. */
export function InstancedVegetationAsset({ asset }: { asset: RegionAssetDef & { instances: InstanceTransform[] } }) {
  const { scene } = useGLTF(asset.src);

  const batch = useMemo(() => {
    const root = new Group();
    root.name = \`vegetation-instances:\${asset.id}\`;
    scene.updateMatrixWorld(true);

    const sourceMeshes: Mesh[] = [];
    scene.traverse((object) => {
      if ((object as Mesh).isMesh) sourceMeshes.push(object as Mesh);
    });

    for (const source of sourceMeshes) {
      const instanced = new InstancedMesh(source.geometry, source.material, asset.instances.length);
      instanced.name = \`\${asset.id}:\${source.name || "mesh"}\`;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      instanced.frustumCulled = true;

      asset.instances.forEach((transform, index) => {
        const position = new Vector3(...transform.position);
        const rotation = new Quaternion().setFromEuler(
          new (requireEuler())(...(transform.rotation ?? [0, 0, 0]))
        );
        const scale = new Vector3(...(transform.scale ?? [1, 1, 1]));
        const matrix = new Matrix4().compose(position, rotation, scale).multiply(source.matrixWorld);
        instanced.setMatrixAt(index, matrix);
      });

      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      root.add(instanced);
    }

    return root;
  }, [asset.id, asset.instances, scene]);

  return (
    <group
      position={asset.position ?? [0, 0, 0]}
      rotation={asset.rotation ?? [0, 0, 0]}
      scale={asset.scale ?? [1, 1, 1]}
    >
      <primitive object={batch} />
    </group>
  );
}

function requireEuler() {
  // Kept as a tiny helper to avoid sharing mutable Euler state across instances.
  return class extends (requireThreeEuler()) {};
}

function requireThreeEuler() {
  // Static import is resolved by the bundler; no runtime module loading is used.
  return Euler;
}

import { Euler } from "three";
