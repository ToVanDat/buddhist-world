import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ArchitecturalLighting, getArchitecturalNightFactor, type ArchitecturalLightDefinition } from "../lighting/ArchitecturalLighting";
import { getLightingTransition } from "../lighting/LightingController";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { TEMPLE_LAYOUT, offsetFromAnchor } from "@bw/shared";

// Fixture positions are authored against the current walkable temple blockout.
const TEMPLE_COMPLEX_LIGHTS: ArchitecturalLightDefinition[] = [
  { id: "tam-quan-west", regionId: "temple_complex", priority: 120, config: { kind: "point", color: "#ffc887", intensity: 2.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.tamQuan, [-4.5, 3.2, -1]), distance: 15, decay: 2 } },
  { id: "tam-quan-east", regionId: "temple_complex", priority: 120, config: { kind: "point", color: "#ffc887", intensity: 2.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.tamQuan, [4.5, 3.2, -1]), distance: 15, decay: 2 } },
  { id: "main-hall-west", regionId: "temple_complex", priority: 115, config: { kind: "spot", color: "#ffcf9a", intensity: 3.1, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-7, 5.2, 9]), target: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-7, 0, 0]), distance: 18, angle: Math.PI / 4, penumbra: 0.8, decay: 2 } },
  { id: "main-hall-east", regionId: "temple_complex", priority: 115, config: { kind: "spot", color: "#ffcf9a", intensity: 3.1, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [7, 5.2, 9]), target: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [7, 0, 0]), distance: 18, angle: Math.PI / 4, penumbra: 0.8, decay: 2 } },
  { id: "main-hall-interior-center", regionId: "temple_complex", priority: 112, config: { kind: "point", color: "#ffcb83", intensity: 3.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [0, 4.1, -1.2]), distance: 20, decay: 1.7 } },
  { id: "main-hall-interior-west", regionId: "temple_complex", priority: 110, config: { kind: "point", color: "#ffd49a", intensity: 2.6, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-5.6, 3.1, -3.1]), distance: 13, decay: 1.8 } },
  { id: "main-hall-interior-east", regionId: "temple_complex", priority: 110, config: { kind: "point", color: "#ffd49a", intensity: 2.6, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [5.6, 3.1, -3.1]), distance: 13, decay: 1.8 } },
  { id: "courtyard-west-north", regionId: "temple_complex", priority: 85, config: { kind: "point", color: "#ffd19b", intensity: 1.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.courtyard, [-3.5, 2.2, 9]), distance: 12, decay: 2 } },
  { id: "courtyard-east-north", regionId: "temple_complex", priority: 85, config: { kind: "point", color: "#ffd19b", intensity: 1.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.courtyard, [3.5, 2.2, 9]), distance: 12, decay: 2 } },
  { id: "courtyard-west-south", regionId: "temple_complex", priority: 85, config: { kind: "point", color: "#ffd19b", intensity: 1.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.courtyard, [-3.5, 2.2, -8]), distance: 12, decay: 2 } },
  { id: "courtyard-east-south", regionId: "temple_complex", priority: 85, config: { kind: "point", color: "#ffd19b", intensity: 1.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.courtyard, [3.5, 2.2, -8]), distance: 12, decay: 2 } },
  { id: "lotus-pond-west", regionId: "temple_complex", priority: 65, config: { kind: "point", color: "#e7b878", intensity: 1.45, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.lotusPond, [-7.5, 2, 0]), distance: 13, decay: 2 } },
  { id: "lotus-pond-east", regionId: "temple_complex", priority: 65, config: { kind: "point", color: "#e7b878", intensity: 1.45, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.lotusPond, [7.5, 2, 0]), distance: 13, decay: 2 } },
];

function LanternFixture({ position }: { position: [number, number, number] }) {
  const glass = useRef<THREE.MeshStandardMaterial>(null);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const receivedAt = useWorldEnvironment((state) => state.receivedAt);
  useFrame(() => {
    let sun = 3;
    if (snapshot && receivedAt !== null) {
      const elapsed = Math.max(0, Date.now() - receivedAt);
      sun = getLightingTransition(snapshot.fromPreset, snapshot.toPreset, Math.min(1, snapshot.transition + elapsed / 3_600_000)).sunIntensity;
    }
    if (glass.current) glass.current.emissiveIntensity = 0.12 + getArchitecturalNightFactor(sun) * 1.65;
  });
  return (
    <group position={position}>
      <mesh castShadow>
        <cylinderGeometry args={[0.17, 0.2, 0.42, 8]} />
        <meshStandardMaterial color="#4b3526" roughness={0.48} metalness={0.58} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.135, 0.135, 0.3, 8]} />
        <meshStandardMaterial ref={glass} color="#ffcf8a" emissive="#ff9c43" emissiveIntensity={0.2} roughness={0.28} transparent opacity={0.88} />
      </mesh>
      <mesh position={[0, 0.24, 0]}>
        <coneGeometry args={[0.22, 0.18, 8]} />
        <meshStandardMaterial color="#493222" roughness={0.5} metalness={0.55} />
      </mesh>
      <mesh position={[0, -0.25, 0]}>
        <cylinderGeometry args={[0.2, 0.14, 0.08, 8]} />
        <meshStandardMaterial color="#493222" roughness={0.5} metalness={0.55} />
      </mesh>
    </group>
  );
}

function TempleFireflies() {
  const inner = useRef<THREE.InstancedMesh>(null);
  const halo = useRef<THREE.InstancedMesh>(null);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const receivedAt = useWorldEnvironment((state) => state.receivedAt);
  const phases = useMemo(() => Array.from({ length: 34 }, (_, index) => ({
    phase: index * 2.399963,
    radius: 4.5 + (index % 7) * 1.05,
    height: 0.65 + (index % 5) * 0.34,
    speed: 0.32 + (index % 4) * 0.09,
  })), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(({ clock }) => {
    let sun = 3;
    if (snapshot && receivedAt !== null) {
      const elapsed = Math.max(0, Date.now() - receivedAt);
      sun = getLightingTransition(snapshot.fromPreset, snapshot.toPreset, Math.min(1, snapshot.transition + elapsed / 3_600_000)).sunIntensity;
    }
    const night = getArchitecturalNightFactor(sun);
    const visible = night > 0.28;
    if (inner.current) {
      inner.current.visible = visible;
      (inner.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.4 + night * 2.2;
    }
    if (halo.current) {
      halo.current.visible = visible;
      (halo.current.material as THREE.MeshBasicMaterial).opacity = 0.08 + night * 0.2;
    }
    phases.forEach((fly, index) => {
      const t = clock.elapsedTime * fly.speed + fly.phase;
      const x = -18 + Math.cos(t) * fly.radius + Math.sin(t * 0.63) * 1.1;
      const z = 4 + Math.sin(t * 0.82) * fly.radius * 0.72;
      const y = fly.height + Math.sin(t * 1.7) * 0.35;
      dummy.position.set(x, y, z);
      const pulse = 0.65 + (Math.sin(t * 2.1) + 1) * 0.25;
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      inner.current?.setMatrixAt(index, dummy.matrix);
      halo.current?.setMatrixAt(index, dummy.matrix);
    });
    if (inner.current) inner.current.instanceMatrix.needsUpdate = true;
    if (halo.current) halo.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="temple-fireflies">
      <instancedMesh ref={halo} args={[undefined as never, undefined as never, phases.length]}>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshBasicMaterial color="#ffd66f" transparent opacity={0.16} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={inner} args={[undefined as never, undefined as never, phases.length]}>
        <sphereGeometry args={[0.045, 8, 8]} />
        <meshStandardMaterial color="#ffe6a1" emissive="#ffbd4c" emissiveIntensity={1.2} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

export function TempleArchitecturalLights() {
  const lanterns: [number, number, number][] = [
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.tamQuan, [-4.5, 3.2, -1]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.tamQuan, [4.5, 3.2, -1]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-7, 4.2, 5.7]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [7, 4.2, 5.7]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-5.6, 3.1, -3.1]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [5.6, 3.1, -3.1]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.courtyard, [-3.5, 2.2, 9]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.courtyard, [3.5, 2.2, 9]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.lotusPond, [-7.5, 2, 0]),
    offsetFromAnchor(TEMPLE_LAYOUT.anchors.lotusPond, [7.5, 2, 0]),
  ];
  return (
    <>
      <ArchitecturalLighting regionId="temple_complex" lights={TEMPLE_COMPLEX_LIGHTS} />
      {lanterns.map((position, index) => <LanternFixture key={index} position={position} />)}
      <TempleFireflies />
    </>
  );
}
