import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Euler, Group, InstancedMesh, Matrix4, Quaternion, Vector3, type Material, type Mesh } from "three";
import type { RegionAssetDef } from "@bw/shared";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { sampleWindMotion } from "../lighting/WindSway";
import { createVertexWindMaterial, resolveVertexWindUniformState, updateVertexWindMaterial } from "../lighting/VertexWind";

type InstanceTransform = NonNullable<RegionAssetDef["instances"]>[number];

interface WindInstanceData {
  baseMatrices: Matrix4[];
  phases: number[];
  materials: Material[];
}

/** Builds one GPU InstancedMesh per source GLB mesh/material, with per-instance and per-vertex wind. */
export function InstancedVegetationAsset({ asset }: { asset: RegionAssetDef & { instances: InstanceTransform[] } }) {
  const { scene } = useGLTF(asset.src);
  const rootRef = useRef<Group>(null);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const temp = useRef({
    position: new Vector3(),
    baseQuaternion: new Quaternion(),
    scale: new Vector3(),
    swayQuaternion: new Quaternion(),
    blendedQuaternion: new Quaternion(),
    swayEuler: new Euler(),
    matrix: new Matrix4(),
  });

  const batch = useMemo(() => {
    const root = new Group();
    root.name = `vegetation-instances:${asset.id}`;
    scene.updateMatrixWorld(true);

    const sourceMeshes: Mesh[] = [];
    scene.traverse((object) => {
      if ((object as Mesh).isMesh) sourceMeshes.push(object as Mesh);
    });

    for (const source of sourceMeshes) {
      const materials = (Array.isArray(source.material) ? source.material : [source.material])
        .map((material) => createVertexWindMaterial(material, 0.022));
      const material = Array.isArray(source.material) ? materials : materials[0]!;
      const instanced = new InstancedMesh(source.geometry, material, asset.instances.length);
      instanced.name = `${asset.id}:${source.name || "mesh"}`;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      instanced.frustumCulled = true;
      const baseMatrices: Matrix4[] = [];
      const phases: number[] = [];

      asset.instances.forEach((transform, index) => {
        const position = new Vector3(...transform.position);
        const rotation = new Quaternion().setFromEuler(
          new Euler(...(transform.rotation ?? [0, 0, 0]))
        );
        const scale = new Vector3(...(transform.scale ?? [1, 1, 1]));
        const matrix = new Matrix4().compose(position, rotation, scale).multiply(source.matrixWorld);
        baseMatrices.push(matrix.clone());
        phases.push((index * 2.399963 + source.id * 0.173) % (Math.PI * 2));
        instanced.setMatrixAt(index, matrix);
      });

      instanced.userData.windInstances = { baseMatrices, phases, materials } satisfies WindInstanceData;
      instanced.instanceMatrix.needsUpdate = true;
      instanced.computeBoundingSphere();
      root.add(instanced);
    }

    return root;
  }, [asset.id, asset.instances, scene]);

  useFrame(({ clock }) => {
    const weather = snapshot?.weather ?? "clear";
    const intensity = snapshot?.weatherIntensity ?? 0;
    const time = clock.elapsedTime;
    const { position, baseQuaternion, scale, swayQuaternion, blendedQuaternion, swayEuler, matrix } = temp.current;
    const vertexState = resolveVertexWindUniformState(weather, intensity, time);

    rootRef.current?.traverse((object) => {
      const instanced = object as InstancedMesh;
      if (!instanced.isInstancedMesh) return;
      const data = instanced.userData.windInstances as WindInstanceData | undefined;
      if (!data) return;
      for (const material of data.materials) updateVertexWindMaterial(material, vertexState);
      for (let i = 0; i < data.baseMatrices.length; i += 1) {
        const base = data.baseMatrices[i];
        if (!base) continue;
        base.decompose(position, baseQuaternion, scale);
        const motion = sampleWindMotion({
          time,
          amplitude: 0.018,
          stiffness: 2.4,
          intensity,
          weather,
          phase: data.phases[i] ?? 0,
        });
        swayEuler.set(motion.rotationX, 0, motion.rotationZ);
        swayQuaternion.setFromEuler(swayEuler);
        blendedQuaternion.copy(baseQuaternion).multiply(swayQuaternion);
        matrix.compose(position, blendedQuaternion, scale);
        instanced.setMatrixAt(i, matrix);
      }
      instanced.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <group
      ref={rootRef}
      position={asset.position ?? [0, 0, 0]}
      rotation={asset.rotation ?? [0, 0, 0]}
      scale={asset.scale ?? [1, 1, 1]}
    >
      <primitive object={batch} />
    </group>
  );
}
