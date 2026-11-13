import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { LotusPondWater, MountainRetreatWaterfall } from "./WaterSurface";
import { WeatherReactiveMaterial } from "../lighting/WeatherReactiveMaterial";
import { WindSway } from "../lighting/WindSway";
import { useSettings } from "../../stores/settings";
import {
  createCurvedRoofGeometry,
  createMountainGeometry,
  createGrassPatchGeometry,
  createSurfaceNoiseTexture,
  createSurfaceNormalTexture,
} from "./TempleProceduralGeometry";

/**
 * Asset-independent procedural replacement for the original primitive blockout.
 * Gameplay anchors remain unchanged: Tam Quan (0,0,20), courtyard (0,0,0),
 * Main Hall (0,0,-22), Lotus Pond (-18,0,4). Blender GLBs can replace these
 * procedural meshes later without changing the region manifest or spawn anchors.
 */
type SurfaceMaps = {
  wood: THREE.DataTexture;
  roof: THREE.DataTexture;
  stone: THREE.DataTexture;
  ground: THREE.DataTexture;
  foliage: THREE.DataTexture;
  woodNormal: THREE.DataTexture;
  roofNormal: THREE.DataTexture;
  stoneNormal: THREE.DataTexture;
  groundNormal: THREE.DataTexture;
  foliageNormal: THREE.DataTexture;
};

function useSurfaceMaps(): SurfaceMaps {
  const maps = useMemo<SurfaceMaps>(() => {
    const wood = createSurfaceNoiseTexture(3, 128);
    const roof = createSurfaceNoiseTexture(7, 128);
    const stone = createSurfaceNoiseTexture(13, 128);
    const ground = createSurfaceNoiseTexture(19, 128);
    const foliage = createSurfaceNoiseTexture(23, 128);
    const woodNormal = createSurfaceNormalTexture(3, 128, 1.8);
    const roofNormal = createSurfaceNormalTexture(7, 128, 2.4);
    const stoneNormal = createSurfaceNormalTexture(13, 128, 2.1);
    const groundNormal = createSurfaceNormalTexture(19, 128, 1.35);
    const foliageNormal = createSurfaceNormalTexture(23, 128, 1.6);
    wood.repeat.set(2, 5);
    roof.repeat.set(5, 3);
    stone.repeat.set(3, 3);
    ground.repeat.set(32, 32);
    foliage.repeat.set(2, 2);
    [woodNormal, roofNormal, stoneNormal, groundNormal, foliageNormal].forEach((normal) => normal.repeat.set(3, 3));
    return { wood, roof, stone, ground, foliage, woodNormal, roofNormal, stoneNormal, groundNormal, foliageNormal };
  }, []);

  useEffect(() => () => {
    Object.values(maps).forEach((texture) => texture.dispose());
  }, [maps]);

  return maps;
}

type TempleColumnSpec = { x: number; z: number; height: number };

function TempleColumnCollider({ x, z, height }: TempleColumnSpec) {
  return (
    <RigidBody type="fixed" colliders={false} position={[x, height / 2, z]}>
      <CuboidCollider args={[0.43, height / 2, 0.43]} />
    </RigidBody>
  );
}

/** Four shared visual batches replace per-column meshes; Rapier colliders stay independent. */
function TempleColumnBatch({ columns, wood }: { columns: TempleColumnSpec[]; wood: THREE.Texture }) {
  const batch = useMemo(() => {
    const shaftGeometry = new THREE.CylinderGeometry(0.31, 0.43, 1, 20, 1);
    const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
    const capGeometry = new THREE.BoxGeometry(1, 1, 1);
    const ringGeometry = new THREE.TorusGeometry(0.39, 0.055, 8, 24);
    const shaftMaterial = new THREE.MeshStandardMaterial({ color: "#68472f", map: wood, roughness: 0.76, bumpMap: wood, bumpScale: 0.035 });
    const baseMaterial = new THREE.MeshStandardMaterial({ color: "#82745f", roughness: 0.9 });
    const capMaterial = new THREE.MeshStandardMaterial({ color: "#785437", map: wood, roughness: 0.72 });
    const ringMaterial = new THREE.MeshStandardMaterial({ color: "#9a7650", roughness: 0.62 });
    const shafts = new THREE.InstancedMesh(shaftGeometry, shaftMaterial, columns.length);
    const bases = new THREE.InstancedMesh(baseGeometry, baseMaterial, columns.length);
    const caps = new THREE.InstancedMesh(capGeometry, capMaterial, columns.length);
    const rings = new THREE.InstancedMesh(ringGeometry, ringMaterial, columns.length);
    const dummy = new THREE.Object3D();

    columns.forEach(({ x, z, height }, index) => {
      const shaftHeight = Math.max(1, height - 0.72);
      dummy.position.set(x, 0.34 + shaftHeight / 2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, shaftHeight, 1);
      dummy.updateMatrix();
      shafts.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, 0.2, z);
      dummy.scale.set(1.05, 0.4, 1.05);
      dummy.updateMatrix();
      bases.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, height - 0.22, z);
      dummy.scale.set(0.98, 0.34, 0.98);
      dummy.updateMatrix();
      caps.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, height - 0.43, z);
      dummy.rotation.set(Math.PI / 2, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      rings.setMatrixAt(index, dummy.matrix);
    });

    const meshes = [shafts, bases, caps, rings];
    meshes.forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    return {
      meshes, geometries: [shaftGeometry, baseGeometry, capGeometry, ringGeometry],
      materials: [shaftMaterial, baseMaterial, capMaterial, ringMaterial],
    };
  }, [columns, wood]);

  useEffect(() => () => {
    batch.geometries.forEach((geometry) => geometry.dispose());
    batch.materials.forEach((material) => material.dispose());
  }, [batch]);

  return <group name="instanced-temple-columns">{batch.meshes.map((mesh, index) => <primitive key={index} object={mesh} />)}</group>;
}

function CurvedRoof({
  width, depth, rise, y, color, texture, normalTexture,
}: {
  width: number; depth: number; rise: number; y: number; color: string; texture: THREE.Texture; normalTexture: THREE.Texture;
}) {
  const geometry = useMemo(
    () => createCurvedRoofGeometry({ width, depth, rise, eaveDrop: 0.2, cornerLift: 0.82, segmentsX: 40, segmentsZ: 22 }),
    [width, depth, rise],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={color}
          map={texture}
          roughness={0.82}
          metalness={0.035}
          bumpMap={texture}
          bumpScale={0.035}
          normalMap={normalTexture}
          normalScale={new THREE.Vector2(0.55, 0.55)}
          displacementMap={texture}
          displacementScale={0.012}
          displacementBias={-0.006}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position={[0, rise + 0.34, 0]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.19, 0.24, depth + 0.9, 12]} />
        <meshStandardMaterial color="#49342b" roughness={0.76} map={texture} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * (width / 2 - 0.08), -0.04, 0]} castShadow>
          <boxGeometry args={[0.18, 0.26, depth + 0.35]} />
          <meshStandardMaterial color="#4d352b" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Gate({ maps }: { maps: SurfaceMaps }) {
  const columnX = [-5.15, -1.72, 1.72, 5.15];
  return (
    <group name="tam-quan-procedural" position={[0, 0, 20]}>
      <mesh position={[0, 0.38, 0]} receiveShadow>
        <boxGeometry args={[12.2, 0.76, 5.2]} />
        <meshStandardMaterial color="#827966" map={maps.stone} roughness={0.94} bumpMap={maps.stone} bumpScale={0.08} />
      </mesh>
      {columnX.map((x, index) => (
        <TempleColumnCollider key={x} x={x} z={0} height={index === 0 || index === 3 ? 5.8 : 6.6} />
      ))}
      <TempleColumnBatch
        columns={columnX.map((x, index) => ({ x, z: 0, height: index === 0 || index === 3 ? 5.8 : 6.6 }))}
        wood={maps.wood}
      />
      <mesh position={[0, 6.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[11.8, 0.55, 1.1]} />
        <meshStandardMaterial color="#573b2a" map={maps.wood} roughness={0.75} />
      </mesh>
      <mesh position={[0, 5.9, 0]} castShadow>
        <boxGeometry args={[10.8, 0.22, 1.45]} />
        <meshStandardMaterial color="#a18154" roughness={0.58} metalness={0.18} />
      </mesh>
      <CurvedRoof width={13.4} depth={5.9} rise={2.05} y={6.9} color="#654336" texture={maps.roof} normalTexture={maps.roofNormal} />
      <CurvedRoof width={8.2} depth={4.4} rise={1.2} y={8.95} color="#704b3a" texture={maps.roof} normalTexture={maps.roofNormal} />
      {[-3.35, 3.35].map((x) => (
        <group key={x} position={[x, 4.65, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.34, 1.15, 0.34]} />
            <meshStandardMaterial color="#8e6d43" roughness={0.62} metalness={0.2} />
          </mesh>
          <mesh position={[0, -0.68, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.42, 0.2, 8]} />
            <meshStandardMaterial color="#5b4030" roughness={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function MainHall({ maps }: { maps: SurfaceMaps }) {
  const frontColumns = [-7.2, -3.6, 3.6, 7.2];
  return (
    <group name="main-hall-procedural" position={[0, 0, -22]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[10.2, 0.42, 7.2]} position={[0, 0.42, 0]} />
        <CuboidCollider args={[8.2, 3.2, 0.42]} position={[0, 3.5, -5.65]} />
        <CuboidCollider args={[0.42, 3, 4.7]} position={[-8, 3.5, -1.5]} />
        <CuboidCollider args={[0.42, 3, 4.7]} position={[8, 3.5, -1.5]} />
        <CuboidCollider args={[2.8, 3, 0.42]} position={[-5.4, 3.5, 3.55]} />
        <CuboidCollider args={[2.8, 3, 0.42]} position={[5.4, 3.5, 3.55]} />
        <CuboidCollider args={[2.6, 0.6, 0.42]} position={[0, 6.4, 3.55]} />
      </RigidBody>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[20.4, 0.8, 14.4]} />
        <meshStandardMaterial color="#817968" map={maps.stone} roughness={0.92} bumpMap={maps.stone} bumpScale={0.09} />
      </mesh>
      {/* Split facade leaves a real walk-through opening instead of a dark decal on a solid wall. */}
      <mesh position={[0, 3.8, -5.65]} castShadow receiveShadow>
        <boxGeometry args={[16.4, 6.0, 0.8]} />
        <meshStandardMaterial color="#b8a98c" roughness={0.9} map={maps.stone} bumpMap={maps.stone} bumpScale={0.025} />
      </mesh>
      {[-8, 8].map((x) => (
        <mesh key={x} position={[x, 3.8, -1.5]} castShadow receiveShadow>
          <boxGeometry args={[0.8, 6.0, 9.4]} />
          <meshStandardMaterial color="#b8a98c" roughness={0.9} map={maps.stone} bumpMap={maps.stone} bumpScale={0.025} />
        </mesh>
      ))}
      {[-5.4, 5.4].map((x) => (
        <mesh key={x} position={[x, 3.8, 3.55]} castShadow receiveShadow>
          <boxGeometry args={[5.6, 6.0, 0.8]} />
          <meshStandardMaterial color="#b8a98c" roughness={0.9} map={maps.stone} bumpMap={maps.stone} bumpScale={0.025} />
        </mesh>
      ))}
      <mesh position={[0, 6.4, 3.55]} castShadow>
        <boxGeometry args={[5.2, 1.2, 0.8]} />
        <meshStandardMaterial color="#62452f" map={maps.wood} roughness={0.78} />
      </mesh>
      <mesh position={[0, 3.35, -5.18]} castShadow>
        <boxGeometry args={[5.2, 5.1, 0.12]} />
        <meshStandardMaterial color="#3d3026" roughness={0.88} />
      </mesh>
      {[
        ...frontColumns.map((x) => ({ x, z: 5.35, height: 6.8 })),
        ...[-7.2, 7.2].flatMap((x) => [-4.4, -0.8, 2.8].map((z) => ({ x, z, height: 6.2 }))),
      ].map((column, index) => <TempleColumnCollider key={index} {...column} />)}
      <TempleColumnBatch
        columns={[
          ...frontColumns.map((x) => ({ x, z: 5.35, height: 6.8 })),
          ...[-7.2, 7.2].flatMap((x) => [-4.4, -0.8, 2.8].map((z) => ({ x, z, height: 6.2 }))),
        ]}
        wood={maps.wood}
      />
      <mesh position={[0, 7.25, 5.45]} castShadow>
        <boxGeometry args={[17.4, 0.52, 0.72]} />
        <meshStandardMaterial color="#573a2a" map={maps.wood} roughness={0.76} />
      </mesh>
      <CurvedRoof width={22.5} depth={16.8} rise={3.2} y={8.25} color="#563a30" texture={maps.roof} normalTexture={maps.roofNormal} />
      <CurvedRoof width={17.2} depth={13.5} rise={2.35} y={10.65} color="#684637" texture={maps.roof} normalTexture={maps.roofNormal} />
      {Array.from({ length: 6 }, (_, index) => (
        <mesh key={index} position={[-5 + index * 2, 1.05 + index * 0.22, 7.5 + index * 0.52]} castShadow receiveShadow>
          <boxGeometry args={[3.4, 0.32, 1.05]} />
          <meshStandardMaterial color="#8e8575" map={maps.stone} roughness={0.94} bumpMap={maps.stone} bumpScale={0.055} />
        </mesh>
      ))}
      {[-5.2, 5.2].map((x) => (
        <mesh key={x} position={[x, 2.3, 5.9]} castShadow>
          <boxGeometry args={[0.18, 2.7, 0.18]} />
          <meshStandardMaterial color="#a58a5a" roughness={0.52} metalness={0.24} />
        </mesh>
      ))}
    </group>
  );
}

function ProceduralTree({
  position, scale = 1, wood, foliage,
}: { position: [number, number, number]; scale?: number; wood: THREE.Texture; foliage: THREE.Texture }) {
  const lod = useMemo(() => {
    const root = new THREE.LOD();
    root.name = "procedural-tree-distance-lod";

    const trunkMaterial = new THREE.MeshStandardMaterial({ color: "#51402f", map: wood, roughness: 0.92, bumpMap: wood, bumpScale: 0.06 });
    const branchMaterial = new THREE.MeshStandardMaterial({ color: "#594431", map: wood, roughness: 0.9 });
    const canopyMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", map: foliage, roughness: 0.94, bumpMap: foliage, bumpScale: 0.025, flatShading: true });
    const resources: THREE.Object3D[] = [];

    const near = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.72, 6.2, 12, 3), trunkMaterial);
    trunk.position.set(0, 3.1, 0);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    near.add(trunk);

    const branchGeometry = new THREE.CylinderGeometry(0.1, 0.3, 2.5, 8);
    const branches = new THREE.InstancedMesh(branchGeometry, branchMaterial, 2);
    const branchDummy = new THREE.Object3D();
    [-1, 1].forEach((side, index) => {
      branchDummy.position.set(side * 0.62, 1.05, 0);
      branchDummy.rotation.set(0, 0, side * -0.42);
      branchDummy.scale.set(1, 1, 1);
      branchDummy.updateMatrix();
      branches.setMatrixAt(index, branchDummy.matrix);
    });
    branches.castShadow = true;
    branches.instanceMatrix.needsUpdate = true;
    near.add(branches);

    const canopyGeometry = new THREE.IcosahedronGeometry(1, 2);
    const canopy = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, 4);
    const clusters: Array<[number, number, number, number, number, number]> = [
      [0, 6.7, 0, 4.3, 2.1, 3.7],
      [-2.1, 7.5, 0.5, 2.5, 1.55, 2.4],
      [2.0, 7.1, -0.4, 2.7, 1.7, 2.6],
      [0.2, 8.35, -0.5, 2.4, 1.5, 2.25],
    ];
    const canopyDummy = new THREE.Object3D();
    clusters.forEach(([x, y, z, sx, sy, sz], index) => {
      canopyDummy.position.set(x, y, z);
      canopyDummy.scale.set(sx, sy, sz);
      canopyDummy.updateMatrix();
      canopy.setMatrixAt(index, canopyDummy.matrix);
      canopy.setColorAt(index, new THREE.Color(index % 2 ? "#40583c" : "#526b45"));
    });
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    canopy.instanceMatrix.needsUpdate = true;
    if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    near.add(canopy);

    const mid = new THREE.Group();
    const midTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.66, 6.2, 8, 1), trunkMaterial);
    midTrunk.position.y = 3.1;
    midTrunk.castShadow = true;
    mid.add(midTrunk);
    const midCanopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), canopyMaterial);
    midCanopy.position.set(0, 7.1, 0);
    midCanopy.scale.set(4.5, 2.35, 4.0);
    midCanopy.castShadow = true;
    mid.add(midCanopy);

    const far = new THREE.Group();
    const farTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.58, 5.8, 6, 1), trunkMaterial);
    farTrunk.position.y = 2.9;
    far.add(farTrunk);
    const farCanopy = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), canopyMaterial);
    farCanopy.position.set(0, 6.4, 0);
    farCanopy.scale.set(3.9, 2.0, 3.6);
    far.add(farCanopy);

    root.addLevel(near, 0, 0.08);
    root.addLevel(mid, 38, 0.1);
    root.addLevel(far, 82, 0.12);
    root.addLevel(new THREE.Group(), 132, 0.05);
    root.autoUpdate = true;
    root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh || (object as THREE.InstancedMesh).isInstancedMesh) {
        const mesh = object as THREE.Mesh;
        mesh.castShadow = mesh.castShadow || object === trunk || object === branches || object === canopy;
        mesh.receiveShadow = mesh.receiveShadow || object === trunk || object === canopy;
      }
    });
    return { root, materials: [trunkMaterial, branchMaterial, canopyMaterial] };
  }, [wood, foliage]);

  useEffect(() => () => {
    const geometries = new Set<THREE.BufferGeometry>();
    lod.root.traverse((object) => {
      if ((object as THREE.Mesh).isMesh || (object as THREE.InstancedMesh).isInstancedMesh) {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) geometries.add(mesh.geometry);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    lod.materials.forEach((material) => material.dispose());
  }, [lod]);

  return (
    <group position={position} scale={scale}>
      <WindSway amplitude={0.018} stiffness={1.9} phase={position[0] * 0.17 + position[2] * 0.11}>
        <primitive object={lod.root} />
      </WindSway>
    </group>
  );
}

function GrassPatch({
  position, seed, width = 10, depth = 8, count = 220,
}: { position: [number, number, number]; seed: number; width?: number; depth?: number; count?: number }) {
  const quality = useSettings((state) => state.quality);
  const mesh = useRef<THREE.Mesh>(null);
  const worldPosition = useRef(new THREE.Vector3(...position));
  const density = quality === "ULTRA" ? 1 : quality === "HIGH" ? 0.82 : quality === "MEDIUM" ? 0.58 : 0.34;
  const visibleDistance = quality === "ULTRA" ? 118 : quality === "HIGH" ? 96 : quality === "MEDIUM" ? 72 : 48;
  const geometry = useMemo(
    () => createGrassPatchGeometry(width, depth, Math.max(24, Math.round(count * density)), seed),
    [width, depth, count, density, seed],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ camera }) => {
    if (!mesh.current) return;
    mesh.current.visible = camera.position.distanceToSquared(worldPosition.current) <= visibleDistance * visibleDistance;
  });

  return (
    <mesh ref={mesh} geometry={geometry} position={position} frustumCulled>
      <meshStandardMaterial color="#ffffff" vertexColors side={THREE.DoubleSide} roughness={1} />
    </mesh>
  );
}

function ProceduralRockInstances({
  rocks, stone, foliage,
}: {
  rocks: Array<{ position: [number, number, number]; scale: [number, number, number] }>;
  stone: THREE.Texture;
  foliage: THREE.Texture;
}) {
  const batch = useMemo(() => {
    const rockGeometry = new THREE.IcosahedronGeometry(1, 2);
    const mossGeometry = new THREE.IcosahedronGeometry(1, 1);
    const rockMaterial = new THREE.MeshStandardMaterial({
      color: "#77776b", map: stone, roughness: 0.96, bumpMap: stone, bumpScale: 0.12, flatShading: true,
    });
    const mossMaterial = new THREE.MeshStandardMaterial({
      color: "#536b43", map: foliage, roughness: 1, bumpMap: foliage, bumpScale: 0.025,
    });
    const rockMesh = new THREE.InstancedMesh(rockGeometry, rockMaterial, rocks.length);
    const mossMesh = new THREE.InstancedMesh(mossGeometry, mossMaterial, rocks.length);
    const dummy = new THREE.Object3D();
    const localMossOffset = new THREE.Vector3(0.12, 0.78, 0.04);
    const scaledMossOffset = new THREE.Vector3();
    const rockRotation = new THREE.Euler(0.13, 0.6, -0.08);

    rocks.forEach((rock, index) => {
      const [x, y, z] = rock.position;
      const [sx, sy, sz] = rock.scale;
      dummy.position.set(x, y, z);
      dummy.rotation.copy(rockRotation);
      dummy.scale.set(sx, sy, sz);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(index, dummy.matrix);

      scaledMossOffset.copy(localMossOffset).multiply(new THREE.Vector3(sx, sy, sz)).applyEuler(rockRotation);
      dummy.position.set(x + scaledMossOffset.x, y + scaledMossOffset.y, z + scaledMossOffset.z);
      dummy.scale.set(sx * 0.56, sy * 0.12, sz * 0.42);
      dummy.updateMatrix();
      mossMesh.setMatrixAt(index, dummy.matrix);
    });

    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;
    mossMesh.castShadow = true;
    mossMesh.receiveShadow = true;
    rockMesh.instanceMatrix.needsUpdate = true;
    mossMesh.instanceMatrix.needsUpdate = true;
    rockMesh.computeBoundingSphere();
    mossMesh.computeBoundingSphere();

    return { rockMesh, mossMesh, rockGeometry, mossGeometry, rockMaterial, mossMaterial };
  }, [rocks, stone, foliage]);

  useEffect(() => () => {
    batch.rockGeometry.dispose();
    batch.mossGeometry.dispose();
    batch.rockMaterial.dispose();
    batch.mossMaterial.dispose();
  }, [batch]);

  return (
    <group name="instanced-procedural-rocks">
      <primitive object={batch.rockMesh} />
      <primitive object={batch.mossMesh} />
    </group>
  );
}

function DistantMountain({
  position, width, depth, height, seed,
}: { position: [number, number, number]; width: number; depth: number; height: number; seed: number }) {
  const geometry = useMemo(() => createMountainGeometry(width, depth, height, seed), [width, depth, height, seed]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial color="#52675e" roughness={1} flatShading />
    </mesh>
  );
}

function TempleEnvironment({ maps }: { maps: SurfaceMaps }) {
  const trees: Array<{ position: [number, number, number]; scale: number }> = [
    { position: [-34, 0, 13], scale: 1.15 },
    { position: [-36, 0, -18], scale: 0.92 },
    { position: [35, 0, 12], scale: 1.08 },
    { position: [37, 0, -18], scale: 1.12 },
    { position: [-28, 0, -39], scale: 0.88 },
    { position: [29, 0, -40], scale: 0.96 },
    { position: [-52, 0, 35], scale: 1.25 },
    { position: [53, 0, 34], scale: 1.18 },
    { position: [-56, 0, -18], scale: 1.05 },
    { position: [56, 0, -15], scale: 1.1 },
  ];
  const grassPatches: Array<{ position: [number, number, number]; seed: number; width: number; depth: number; count: number }> = [
    { position: [-34, 0, 0], seed: 3, width: 12, depth: 9, count: 260 },
    { position: [34, 0, 0], seed: 7, width: 12, depth: 9, count: 260 },
    { position: [-42, 0, -29], seed: 11, width: 10, depth: 12, count: 240 },
    { position: [42, 0, -29], seed: 17, width: 10, depth: 12, count: 240 },
    { position: [-48, 0, 23], seed: 21, width: 13, depth: 10, count: 280 },
    { position: [48, 0, 22], seed: 29, width: 13, depth: 10, count: 280 },
    { position: [-23, 0, -45], seed: 37, width: 12, depth: 9, count: 220 },
    { position: [23, 0, -46], seed: 41, width: 12, depth: 9, count: 220 },
  ];
  const rocks: Array<{ position: [number, number, number]; scale: [number, number, number] }> = [
    { position: [-27, 0.45, 10], scale: [2.8, 0.9, 1.8] },
    { position: [-25, 0.3, -1], scale: [1.7, 0.6, 1.2] },
    { position: [-10, 0.38, 12], scale: [2.2, 0.76, 1.5] },
    { position: [24, 0.35, 8], scale: [2.5, 0.72, 1.8] },
    { position: [27, 0.42, -3], scale: [1.8, 0.84, 1.35] },
    { position: [-24, 0.4, -31], scale: [2.4, 0.8, 1.7] },
    { position: [24, 0.36, -32], scale: [2.1, 0.72, 1.6] },
  ];

  return (
    <group name="procedural-temple-environment">
      {trees.map((tree, index) => (
        <ProceduralTree key={index} {...tree} wood={maps.wood} foliage={maps.foliage} />
      ))}
      <ProceduralRockInstances rocks={rocks} stone={maps.stone} foliage={maps.foliage} />
      {grassPatches.map((patch) => <GrassPatch key={patch.seed} {...patch} />)}
      <DistantMountain position={[-76, -1, -83]} width={88} depth={48} height={28} seed={2} />
      <DistantMountain position={[73, -1, -92]} width={96} depth={54} height={34} seed={5} />
      <DistantMountain position={[0, -1, -112]} width={120} depth={48} height={31} seed={9} />
      <DistantMountain position={[-108, -1, 8]} width={54} depth={88} height={24} seed={12} />
      <DistantMountain position={[108, -1, 12]} width={58} depth={92} height={26} seed={16} />
    </group>
  );
}

function CourtyardPath({ stone }: { stone: THREE.Texture }) {
  const batch = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: "#ffffff", map: stone, roughness: 0.95, bumpMap: stone, bumpScale: 0.07,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, 20);
    const dummy = new THREE.Object3D();

    for (let index = 0; index < 18; index += 1) {
      const z = 23 - index * 2.75;
      const offset = Math.sin(index * 1.7) * 0.22;
      dummy.position.set(offset, 0.035, z);
      dummy.rotation.set(0, Math.sin(index * 2.1) * 0.035, 0);
      dummy.scale.set(4.55 - (index % 3) * 0.12, 0.09, 2.45);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, new THREE.Color(index % 2 ? "#898373" : "#777466"));
    }

    for (let index = 0; index < 2; index += 1) {
      dummy.position.set(index === 0 ? -2.7 : 2.7, 0.16, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(0.22, 0.32, 47);
      dummy.updateMatrix();
      mesh.setMatrixAt(index + 18, dummy.matrix);
      mesh.setColorAt(index + 18, new THREE.Color("#716c5f"));
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return { mesh, geometry, material };
  }, [stone]);

  useEffect(() => () => {
    batch.geometry.dispose();
    batch.material.dispose();
  }, [batch]);

  return <primitive object={batch.mesh} />;
}

export function TempleRegion() {
  const maps = useSurfaceMaps();

  return (
    <group name="temple-complex-procedural-blockout-upgrade">
      {/* Flat playable collision floor is intentionally retained around all spawn anchors. */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[125, 0.5, 125]} position={[0, -0.5, 0]} />
      </RigidBody>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, -0.012, 0]}>
        <planeGeometry args={[250, 250, 1, 1]} />
        <WeatherReactiveMaterial color="#56634a" baseRoughness={0.98} baseClearcoat={0.01} map={maps.ground} roughnessMap={maps.ground} bumpMap={maps.ground} bumpScale={0.035} normalMap={maps.groundNormal} normalScale={new THREE.Vector2(0.42, 0.42)} />
      </mesh>

      <CourtyardPath stone={maps.stone} />
      <LotusPondWater position={[-18, 0.025, 4]} rotation={[-Math.PI / 2, 0, 0]} size={[14, 14]} deepColor="#123d43" shallowColor="#579b91" />
      <Gate maps={maps} />
      <MainHall maps={maps} />
      <TempleEnvironment maps={maps} />
      <MountainRetreatWaterfall />
    </group>
  );
}
