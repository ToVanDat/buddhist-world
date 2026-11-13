import { useEffect, useMemo } from "react";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { LotusPondWater, MountainRetreatWaterfall } from "./WaterSurface";
import { WeatherReactiveMaterial } from "../lighting/WeatherReactiveMaterial";
import { WindSway } from "../lighting/WindSway";
import {
  createCurvedRoofGeometry,
  createMountainGeometry,
  createGrassPatchGeometry,
  createSurfaceNoiseTexture,
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
};

function useSurfaceMaps(): SurfaceMaps {
  const maps = useMemo<SurfaceMaps>(() => {
    const wood = createSurfaceNoiseTexture(3, 128);
    const roof = createSurfaceNoiseTexture(7, 128);
    const stone = createSurfaceNoiseTexture(13, 128);
    const ground = createSurfaceNoiseTexture(19, 128);
    const foliage = createSurfaceNoiseTexture(23, 128);
    wood.repeat.set(2, 5);
    roof.repeat.set(5, 3);
    stone.repeat.set(3, 3);
    ground.repeat.set(32, 32);
    foliage.repeat.set(2, 2);
    return { wood, roof, stone, ground, foliage };
  }, []);

  useEffect(() => () => {
    Object.values(maps).forEach((texture) => texture.dispose());
  }, [maps]);

  return maps;
}

function TempleColumn({
  x, z, height, wood,
}: { x: number; z: number; height: number; wood: THREE.Texture }) {
  const shaftHeight = Math.max(1, height - 0.72);
  return (
    <RigidBody type="fixed" colliders={false} position={[x, height / 2, z]}>
      <CuboidCollider args={[0.43, height / 2, 0.43]} />
      <mesh castShadow receiveShadow position={[0, -height / 2 + 0.34 + shaftHeight / 2, 0]}>
        <cylinderGeometry args={[0.31, 0.43, shaftHeight, 20, 1]} />
        <meshStandardMaterial color="#68472f" map={wood} roughness={0.76} bumpMap={wood} bumpScale={0.035} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, -height / 2 + 0.2, 0]}>
        <boxGeometry args={[1.05, 0.4, 1.05]} />
        <meshStandardMaterial color="#82745f" roughness={0.9} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, height / 2 - 0.22, 0]}>
        <boxGeometry args={[0.98, 0.34, 0.98]} />
        <meshStandardMaterial color="#785437" map={wood} roughness={0.72} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, height / 2 - 0.43, 0]} rotation-x={Math.PI / 2}>
        <torusGeometry args={[0.39, 0.055, 8, 24]} />
        <meshStandardMaterial color="#9a7650" roughness={0.62} />
      </mesh>
    </RigidBody>
  );
}

function CurvedRoof({
  width, depth, rise, y, color, texture,
}: {
  width: number; depth: number; rise: number; y: number; color: string; texture: THREE.Texture;
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
          bumpScale={0.045}
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
        <TempleColumn key={x} x={x} z={0} height={index === 0 || index === 3 ? 5.8 : 6.6} wood={maps.wood} />
      ))}
      <mesh position={[0, 6.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[11.8, 0.55, 1.1]} />
        <meshStandardMaterial color="#573b2a" map={maps.wood} roughness={0.75} />
      </mesh>
      <mesh position={[0, 5.9, 0]} castShadow>
        <boxGeometry args={[10.8, 0.22, 1.45]} />
        <meshStandardMaterial color="#a18154" roughness={0.58} metalness={0.18} />
      </mesh>
      <CurvedRoof width={13.4} depth={5.9} rise={2.05} y={6.9} color="#654336" texture={maps.roof} />
      <CurvedRoof width={8.2} depth={4.4} rise={1.2} y={8.95} color="#704b3a" texture={maps.roof} />
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
  const frontColumns = [-7.2, -3.6, 0, 3.6, 7.2];
  return (
    <group name="main-hall-procedural" position={[0, 0, -22]}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[10.2, 0.42, 7.2]} position={[0, 0.42, 0]} />
        <CuboidCollider args={[8.2, 3.2, 0.42]} position={[0, 3.5, -5.65]} />
      </RigidBody>
      <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[20.4, 0.8, 14.4]} />
        <meshStandardMaterial color="#817968" map={maps.stone} roughness={0.92} bumpMap={maps.stone} bumpScale={0.09} />
      </mesh>
      <mesh position={[0, 3.8, -1.5]} castShadow receiveShadow>
        <boxGeometry args={[16.4, 6.0, 10.1]} />
        <meshStandardMaterial color="#b8a98c" roughness={0.9} map={maps.stone} bumpMap={maps.stone} bumpScale={0.025} />
      </mesh>
      <mesh position={[0, 6.45, 3.55]} castShadow>
        <boxGeometry args={[13.8, 2.1, 0.28]} />
        <meshStandardMaterial color="#62452f" map={maps.wood} roughness={0.78} />
      </mesh>
      <mesh position={[0, 4.5, 3.72]} castShadow>
        <boxGeometry args={[5.2, 3.0, 0.12]} />
        <meshStandardMaterial color="#3d3026" roughness={0.85} />
      </mesh>
      {frontColumns.map((x) => (
        <TempleColumn key={x} x={x} z={5.35} height={6.8} wood={maps.wood} />
      ))}
      {[-7.2, 7.2].map((x) => (
        <ReactSideColumns key={x} x={x} wood={maps.wood} />
      ))}
      <mesh position={[0, 7.25, 5.45]} castShadow>
        <boxGeometry args={[17.4, 0.52, 0.72]} />
        <meshStandardMaterial color="#573a2a" map={maps.wood} roughness={0.76} />
      </mesh>
      <CurvedRoof width={22.5} depth={16.8} rise={3.2} y={8.25} color="#563a30" texture={maps.roof} />
      <CurvedRoof width={17.2} depth={13.5} rise={2.35} y={10.65} color="#684637" texture={maps.roof} />
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

function ReactSideColumns({ x, wood }: { x: number; wood: THREE.Texture }) {
  return (
    <>
      {[-4.4, -0.8, 2.8].map((z) => (
        <TempleColumn key={z} x={x} z={z} height={6.2} wood={wood} />
      ))}
    </>
  );
}

function ProceduralTree({
  position, scale = 1, wood, foliage,
}: { position: [number, number, number]; scale?: number; wood: THREE.Texture; foliage: THREE.Texture }) {
  return (
    <group position={position} scale={scale}>
      <WindSway amplitude={0.018} stiffness={1.9} phase={position[0] * 0.17 + position[2] * 0.11}>
        <group>
          <mesh position={[0, 3.1, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.34, 0.72, 6.2, 12, 3]} />
            <meshStandardMaterial color="#51402f" map={wood} roughness={0.92} bumpMap={wood} bumpScale={0.06} />
          </mesh>
          {[-1, 1].map((side) => (
            <mesh key={side} position={[side * 0.62, 1.05, 0]} rotation-z={side * -0.42} castShadow>
              <cylinderGeometry args={[0.1, 0.3, 2.5, 8]} />
              <meshStandardMaterial color="#594431" map={wood} roughness={0.9} />
            </mesh>
          ))}
          {[
            [0, 6.7, 0, 4.3, 2.1, 3.7],
            [-2.1, 7.5, 0.5, 2.5, 1.55, 2.4],
            [2.0, 7.1, -0.4, 2.7, 1.7, 2.6],
            [0.2, 8.35, -0.5, 2.4, 1.5, 2.25],
          ].map(([x, y, z, sx, sy, sz], index) => (
            <mesh key={index} position={[x, y, z]} scale={[sx, sy, sz]} castShadow receiveShadow>
              <icosahedronGeometry args={[1, 2]} />
              <meshStandardMaterial color={index % 2 ? "#40583c" : "#526b45"} map={foliage} roughness={0.94} bumpMap={foliage} bumpScale={0.025} flatShading />
            </mesh>
          ))}
        </group>
      </WindSway>
    </group>
  );
}

function GrassPatch({
  position, seed, width = 10, depth = 8, count = 220,
}: { position: [number, number, number]; seed: number; width?: number; depth?: number; count?: number }) {
  const geometry = useMemo(
    () => createGrassPatchGeometry(width, depth, count, seed),
    [width, depth, count, seed],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} position={position} frustumCulled>
      <meshStandardMaterial color="#ffffff" vertexColors side={THREE.DoubleSide} roughness={1} />
    </mesh>
  );
}

function ProceduralRock({
  position, scale, stone, foliage,
}: { position: [number, number, number]; scale: [number, number, number]; stone: THREE.Texture; foliage: THREE.Texture }) {
  return (
    <group position={position} scale={scale} rotation={[0.13, 0.6, -0.08]}>
      <mesh castShadow receiveShadow>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial color="#77776b" map={stone} roughness={0.96} bumpMap={stone} bumpScale={0.12} flatShading />
      </mesh>
      <mesh position={[0.12, 0.78, 0.04]} scale={[0.56, 0.12, 0.42]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color="#536b43" map={foliage} roughness={1} bumpMap={foliage} bumpScale={0.025} />
      </mesh>
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
      {rocks.map((rock, index) => <ProceduralRock key={index} {...rock} stone={maps.stone} foliage={maps.foliage} />)}
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
  return (
    <group name="courtyard-stone-path">
      {Array.from({ length: 18 }, (_, index) => {
        const z = 23 - index * 2.75;
        const offset = Math.sin(index * 1.7) * 0.22;
        return (
          <mesh key={index} position={[offset, 0.035, z]} rotation-y={Math.sin(index * 2.1) * 0.035} receiveShadow castShadow>
            <boxGeometry args={[4.55 - (index % 3) * 0.12, 0.09, 2.45]} />
            <meshStandardMaterial color={index % 2 ? "#898373" : "#777466"} map={stone} roughness={0.95} bumpMap={stone} bumpScale={0.07} />
          </mesh>
        );
      })}
      {[-2.7, 2.7].map((x) => (
        <mesh key={x} position={[x, 0.16, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.22, 0.32, 47]} />
          <meshStandardMaterial color="#716c5f" map={stone} roughness={0.96} />
        </mesh>
      ))}
    </group>
  );
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
        <WeatherReactiveMaterial color="#56634a" baseRoughness={0.98} baseClearcoat={0.01} map={maps.ground} roughnessMap={maps.ground} bumpMap={maps.ground} bumpScale={0.055} />
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
