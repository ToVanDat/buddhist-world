import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { SmokeEmitter } from "../particles/ParticleEngine";
import { WORLD_INTERACTIONS, type WorldInteractionDef } from "@bw/shared";
import { useGame } from "../../stores/game";


function BellProxy({ pulseAt }: { pulseAt: number | null }) {
  const bell = useRef<Group>(null);
  const lastPulse = useRef(0);
  const startedAt = useRef(-10);
  useFrame(({ clock }) => {
    if (pulseAt && pulseAt !== lastPulse.current) {
      lastPulse.current = pulseAt;
      startedAt.current = clock.elapsedTime;
    }
    const age = clock.elapsedTime - startedAt.current;
    if (bell.current) bell.current.rotation.z = age >= 0 && age < 1.2
      ? Math.sin(age * 19) * Math.exp(-age * 3.2) * 0.14
      : 0;
  });
  return (
    <group ref={bell}>
      <mesh position={[0, 1.55, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.82, 1.05, 20, 1, true]} />
        <meshStandardMaterial color="#9b7840" metalness={0.72} roughness={0.3} side={2} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <torusGeometry args={[0.77, 0.07, 8, 24]} />
        <meshStandardMaterial color="#c4a35d" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, 2.18, 0]}>
        <torusGeometry args={[0.2, 0.055, 8, 16]} />
        <meshStandardMaterial color="#9b7840" metalness={0.7} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.12, 0.16, 0.9, 10]} />
        <meshStandardMaterial color="#65452c" roughness={0.7} />
      </mesh>
    </group>
  );
}


function InteractionModel({ target, interactionAt }: { target: WorldInteractionDef; interactionAt: number | null }) {
  switch (target.kind) {
    case "bell":
      return <BellProxy pulseAt={interactionAt} />;
    case "incense":
      return (
        <group>
          <mesh position={[0, 0.42, 0]} castShadow>
            <cylinderGeometry args={[0.62, 0.48, 0.65, 16]} />
            <meshStandardMaterial color="#8c8980" roughness={0.78} />
          </mesh>
          <mesh position={[0, 0.78, 0]}>
            <cylinderGeometry args={[0.66, 0.66, 0.1, 16]} />
            <meshStandardMaterial color="#b1a58d" roughness={0.7} />
          </mesh>
          {([[-0.18, 0, 0], [0.12, 0, 0.08], [0.02, 0, -0.16]] as [number, number, number][]).map(([x, , z], i) => (
            <mesh key={i} position={[x, 1.12, z]} rotation-z={-0.08 + i * 0.08}>
              <cylinderGeometry args={[0.018, 0.018, 0.72, 6]} />
              <meshStandardMaterial color="#5d3925" />
            </mesh>
          ))}
          <SmokeEmitter position={[0, 1.08, 0]} count={20} rise={1.75} lifetime={5.8} wind={[0.045, 0, 0.02]} />
        </group>
      );
    case "buddha":
      return (
        <group>
          <mesh position={[0, 0.25, 0]} castShadow>
            <boxGeometry args={[1.8, 0.45, 1.25]} />
            <meshStandardMaterial color="#777568" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1.15, 0]} scale={[0.72, 0.68, 0.5]} castShadow>
            <sphereGeometry args={[1, 20, 16]} />
            <meshStandardMaterial color="#b89b61" roughness={0.58} />
          </mesh>
          <mesh position={[0, 2.02, 0]} castShadow>
            <sphereGeometry args={[0.43, 20, 16]} />
            <meshStandardMaterial color="#c5a96d" roughness={0.52} />
          </mesh>
          <mesh position={[0, 2.48, 0]}>
            <sphereGeometry args={[0.13, 12, 10]} />
            <meshStandardMaterial color="#c5a96d" />
          </mesh>
          <mesh position={[-0.57, 0.88, 0.08]} rotation-z={-0.45} scale={[0.2, 0.55, 0.2]}>
            <sphereGeometry args={[1, 14, 12]} />
            <meshStandardMaterial color="#b89b61" />
          </mesh>
          <mesh position={[0.57, 0.88, 0.08]} rotation-z={0.45} scale={[0.2, 0.55, 0.2]}>
            <sphereGeometry args={[1, 14, 12]} />
            <meshStandardMaterial color="#b89b61" />
          </mesh>
        </group>
      );
    case "altar":
      return (
        <group>
          <mesh position={[0, 0.95, 0]} castShadow>
            <boxGeometry args={[2.2, 0.2, 1.05]} />
            <meshStandardMaterial color="#593a25" roughness={0.58} />
          </mesh>
          {[-0.88, 0.88].map((x) => [-0.34, 0.34].map((z) => (
            <mesh key={`${x}:${z}`} position={[x, 0.45, z]} castShadow>
              <boxGeometry args={[0.16, 0.85, 0.16]} />
              <meshStandardMaterial color="#68452c" roughness={0.65} />
            </mesh>
          )))}
        </group>
      );
    case "npc":
      return null;
  }
}

export function WorldInteractionProps({ regionId }: { regionId: string }) {
  const nearbyId = useGame((state) => state.nearbyInteraction?.id);
  const lastInteraction = useGame((state) => state.lastWorldInteraction);
  const npcStates = useGame((state) => state.npcStates);
  return (
    <group name="world-interaction-proxies">
      {WORLD_INTERACTIONS.filter((target) => target.regionId === regionId && !(target.kind === "npc" && npcStates[target.id]?.active === false)).map((target) => (
        <group key={target.id} name={`interaction:${target.id}`} position={target.kind === "npc" ? npcStates[target.id]?.state?.position ?? target.position : target.position}>
          <InteractionModel target={target} interactionAt={lastInteraction?.targetId === target.id ? lastInteraction.at : null} />
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]}>
            <ringGeometry args={nearbyId === target.id ? [1.05, 1.28, 32] : [0.92, 1.02, 32]} />
            <meshBasicMaterial color={nearbyId === target.id ? "#e4c779" : "#9c927b"} transparent opacity={nearbyId === target.id ? 0.8 : 0.35} depthWrite={false} />
          </mesh>
          {target.kind !== "npc" && <Html position={[0, 2.8, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
            <span className="world-interaction-label">{target.name}</span>
          </Html>}
        </group>
      ))}
    </group>
  );
}
