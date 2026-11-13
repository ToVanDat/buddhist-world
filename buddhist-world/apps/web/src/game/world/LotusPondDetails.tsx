import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useSettings } from "../../stores/settings";
import type { Quality } from "../rendering/quality";

export interface LotusPondLayout {
  leaves: Array<{ x: number; z: number; scale: number; rotation: number }>;
  flowers: Array<{ x: number; z: number; rotation: number }>;
}

export function resolveLotusPondLayout(quality: Quality): LotusPondLayout {
  const leafCount = quality === "ULTRA" ? 16 : quality === "HIGH" ? 13 : quality === "MEDIUM" ? 9 : 5;
  const flowerCount = quality === "ULTRA" ? 4 : quality === "HIGH" ? 3 : quality === "MEDIUM" ? 2 : 1;
  const leaves: LotusPondLayout["leaves"] = [];
  for (let index = 0; index < leafCount; index += 1) {
    const angle = index * 2.399963229728653;
    const radius = 2.0 + (index % 4) * 0.88;
    leaves.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
      scale: 0.72 + (index % 5) * 0.11,
      rotation: angle * 0.7,
    });
  }
  const flowerAnchors = [
    { x: -1.45, z: -1.1 },
    { x: 2.15, z: 0.35 },
    { x: -0.2, z: 3.35 },
    { x: 3.3, z: -2.45 },
  ];
  const flowers = flowerAnchors.slice(0, flowerCount).map((flower, index) => ({
    ...flower,
    rotation: index * 1.17,
  }));
  return { leaves, flowers };
}

/** Visual-only lotus leaves and blossoms; no physics bodies or navigation data. */
export function LotusPondDetails() {
  const quality = useSettings((state) => state.quality);
  const batch = useMemo(() => {
    const layout = resolveLotusPondLayout(quality);
    const leafShape = new THREE.Shape();
    const leafRadius = 0.72;
    leafShape.moveTo(0, 0);
    leafShape.absarc(0, 0, leafRadius, 0.22, Math.PI * 2 - 0.22, false);
    leafShape.lineTo(0, 0);
    const leafGeometry = new THREE.ShapeGeometry(leafShape, 28);
    leafGeometry.rotateX(-Math.PI / 2);
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: "#4f8060",
      roughness: 0.86,
      side: THREE.DoubleSide,
    });
    const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, layout.leaves.length);
    const dummy = new THREE.Object3D();
    const leafColors = ["#416f50", "#56845d", "#668c61", "#3f7559"];
    layout.leaves.forEach((leaf, index) => {
      dummy.position.set(leaf.x, 0.105, leaf.z);
      dummy.rotation.set(0, leaf.rotation, 0);
      dummy.scale.set(leaf.scale, 1, leaf.scale);
      dummy.updateMatrix();
      leaves.setMatrixAt(index, dummy.matrix);
      leaves.setColorAt(index, new THREE.Color(leafColors[index % leafColors.length]!));
    });
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    leaves.receiveShadow = true;
    leaves.computeBoundingSphere();

    const petalGeometry = new THREE.SphereGeometry(1, 12, 8);
    const petalMaterial = new THREE.MeshStandardMaterial({
      color: "#f1d9d0",
      roughness: 0.58,
      side: THREE.DoubleSide,
    });
    const petals = new THREE.InstancedMesh(petalGeometry, petalMaterial, layout.flowers.length * 6);
    const centerGeometry = new THREE.SphereGeometry(0.13, 12, 8);
    const centerMaterial = new THREE.MeshStandardMaterial({ color: "#e5b84d", roughness: 0.62 });
    const centers = new THREE.InstancedMesh(centerGeometry, centerMaterial, layout.flowers.length);
    const stemGeometry = new THREE.CylinderGeometry(0.025, 0.035, 0.36, 7);
    const stemMaterial = new THREE.MeshStandardMaterial({ color: "#52785a", roughness: 0.92 });
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, layout.flowers.length);
    let petalIndex = 0;
    layout.flowers.forEach((flower) => {
      for (let petal = 0; petal < 6; petal += 1) {
        const angle = (petal / 6) * Math.PI * 2 + flower.rotation;
        dummy.position.set(flower.x + Math.cos(angle) * 0.19, 0.36, flower.z + Math.sin(angle) * 0.19);
        dummy.rotation.set(-0.16, -angle, 0.16);
        dummy.scale.set(0.34, 0.12, 0.16);
        dummy.updateMatrix();
        petals.setMatrixAt(petalIndex, dummy.matrix);
        petals.setColorAt(petalIndex, new THREE.Color(petal % 2 ? "#f3d8ce" : "#e8bdb5"));
        petalIndex += 1;
      }
      dummy.position.set(flower.x, 0.42, flower.z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      centers.setMatrixAt(layout.flowers.indexOf(flower), dummy.matrix);
      dummy.position.set(flower.x, 0.27, flower.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      stems.setMatrixAt(layout.flowers.indexOf(flower), dummy.matrix);
    });
    [petals, centers, stems].forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
    return {
      leaves, petals, centers, stems,
      geometries: [leafGeometry, petalGeometry, centerGeometry, stemGeometry],
      materials: [leafMaterial, petalMaterial, centerMaterial, stemMaterial],
    };
  }, [quality]);

  useEffect(() => () => {
    batch.geometries.forEach((geometry) => geometry.dispose());
    batch.materials.forEach((material) => material.dispose());
  }, [batch]);

  return (
    <group name="lotus-pond-visual-details" position={[-18, 0, 4]}>
      <primitive object={batch.leaves} />
      <primitive object={batch.stems} />
      <primitive object={batch.petals} />
      <primitive object={batch.centers} />
    </group>
  );
}
