import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { ArchitecturalLighting, type ArchitecturalLightDefinition } from "../lighting/ArchitecturalLighting";
import { resolveCelestialDirections, resolveWorldMinute } from "../lighting/CelestialCycle";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { TEMPLE_LAYOUT, offsetFromAnchor } from "@bw/shared";

// Fixture positions are authored against the current walkable temple blockout.
const TEMPLE_COMPLEX_LIGHTS: ArchitecturalLightDefinition[] = [
  { id: "tam-quan-west", regionId: "temple_complex", priority: 120, config: { kind: "point", color: "#ffc887", intensity: 2.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.tamQuan, [-4.5, 3.2, -1]), distance: 15, decay: 2 } },
  { id: "tam-quan-east", regionId: "temple_complex", priority: 120, config: { kind: "point", color: "#ffc887", intensity: 2.8, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.tamQuan, [4.5, 3.2, -1]), distance: 15, decay: 2 } },
  { id: "main-hall-west", regionId: "temple_complex", priority: 130, config: { kind: "spot", color: "#ffcf9a", intensity: 3.1, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-7, 5.2, 9]), target: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-7, 0, 0]), distance: 18, angle: Math.PI / 4, penumbra: 0.8, decay: 2 } },
  { id: "main-hall-east", regionId: "temple_complex", priority: 130, config: { kind: "spot", color: "#ffcf9a", intensity: 3.1, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [7, 5.2, 9]), target: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [7, 0, 0]), distance: 18, angle: Math.PI / 4, penumbra: 0.8, decay: 2 } },
  { id: "main-hall-interior-center", regionId: "temple_complex", priority: 145, config: { kind: "point", color: "#ffcb83", intensity: 6.2, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [0, 4.1, -1.2]), distance: 28, decay: 1.35 } },
  { id: "main-hall-interior-west", regionId: "temple_complex", priority: 140, config: { kind: "point", color: "#ffd49a", intensity: 4.0, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [-5.6, 3.1, -3.1]), distance: 20, decay: 1.4 } },
  { id: "main-hall-interior-east", regionId: "temple_complex", priority: 140, config: { kind: "point", color: "#ffd49a", intensity: 4.0, position: offsetFromAnchor(TEMPLE_LAYOUT.anchors.mainHall, [5.6, 3.1, -3.1]), distance: 20, decay: 1.4 } },
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
  useFrame(({ clock }) => {
    const night = resolveCelestialDirections(resolveWorldMinute(snapshot, receivedAt)).night;
    if (glass.current) {
      const flicker = 0.96 + Math.sin(clock.elapsedTime * 7.1 + position[0] * 0.7) * 0.025;
      glass.current.emissiveIntensity = (0.12 + night * 1.65) * flicker;
    }
  });
  return (
    <group position={position}>
      <mesh position={[0, -(Math.max(0.8, position[1] - 0.45)) / 2, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.06, Math.max(0.8, position[1] - 0.45), 8]} />
        <meshStandardMaterial color="#493a2a" roughness={0.82} metalness={0.28} />
      </mesh>
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
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const receivedAt = useWorldEnvironment((state) => state.receivedAt);
  const phases = useMemo(() => Array.from({ length: 34 }, (_, index) => ({
    phase: index * 2.399963,
    radius: 4.5 + (index % 7) * 1.05,
    height: 0.65 + (index % 5) * 0.34,
    speed: 0.32 + (index % 4) * 0.09,
  })), []);
  const resources = useMemo(() => {
    const innerGeometry = new THREE.SphereGeometry(0.045, 8, 8);
    const haloGeometry = new THREE.SphereGeometry(0.13, 8, 8);
    const innerMaterial = new THREE.MeshStandardMaterial({ color: "#ffe6a1", emissive: "#ffbd4c", emissiveIntensity: 1.2, toneMapped: false });
    const haloMaterial = new THREE.MeshBasicMaterial({ color: "#ffd66f", transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
    const inner = new THREE.InstancedMesh(innerGeometry, innerMaterial, phases.length);
    const halo = new THREE.InstancedMesh(haloGeometry, haloMaterial, phases.length);
    inner.frustumCulled = false;
    halo.frustumCulled = false;
    return { inner, halo, innerGeometry, haloGeometry, innerMaterial, haloMaterial };
  }, [phases.length]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => () => {
    resources.innerGeometry.dispose();
    resources.haloGeometry.dispose();
    resources.innerMaterial.dispose();
    resources.haloMaterial.dispose();
  }, [resources]);
  useFrame(({ clock }) => {
    const night = resolveCelestialDirections(resolveWorldMinute(snapshot, receivedAt)).night;
    const visible = night > 0.28;
    resources.inner.visible = visible;
    resources.halo.visible = visible;
    resources.innerMaterial.emissiveIntensity = 0.4 + night * 2.2;
    resources.haloMaterial.opacity = 0.08 + night * 0.2;
    phases.forEach((fly, index) => {
      const t = clock.elapsedTime * fly.speed + fly.phase;
      const x = -18 + Math.cos(t) * fly.radius + Math.sin(t * 0.63) * 1.1;
      const z = 4 + Math.sin(t * 0.82) * fly.radius * 0.72;
      const y = fly.height + Math.sin(t * 1.7) * 0.35;
      dummy.position.set(x, y, z);
      const pulse = 0.65 + (Math.sin(t * 2.1) + 1) * 0.25;
      dummy.scale.setScalar(pulse);
      dummy.updateMatrix();
      resources.inner.setMatrixAt(index, dummy.matrix);
      resources.halo.setMatrixAt(index, dummy.matrix);
    });
    resources.inner.instanceMatrix.needsUpdate = true;
    resources.halo.instanceMatrix.needsUpdate = true;
  });
  return (
    <group name="temple-fireflies">
      <primitive object={resources.halo} />
      <primitive object={resources.inner} />
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
