import { Html } from "@react-three/drei";
import { WORLD_INTERACTIONS, type WorldInteractionDef } from "@bw/shared";
import { useGame } from "../../stores/game";

function InteractionModel({ target }: { target: WorldInteractionDef }) {
  switch (target.kind) {
    case "bell":
      return (
        <group>
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
      return (
        <group>
          <mesh position={[0, 0.85, 0]} castShadow>
            <capsuleGeometry args={[0.38, 0.72, 6, 12]} />
            <meshStandardMaterial color="#b98a43" roughness={0.85} />
          </mesh>
          <mesh position={[0, 1.62, 0]} castShadow>
            <sphereGeometry args={[0.3, 16, 14]} />
            <meshStandardMaterial color="#d7b28c" roughness={0.88} />
          </mesh>
          <mesh position={[0, 1.92, 0]}>
            <sphereGeometry args={[0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#302c25" roughness={0.9} />
          </mesh>
        </group>
      );
  }
}

export function WorldInteractionProps({ regionId }: { regionId: string }) {
  const nearbyId = useGame((state) => state.nearbyInteraction?.id);
  return (
    <group name="world-interaction-proxies">
      {WORLD_INTERACTIONS.filter((target) => target.regionId === regionId).map((target) => (
        <group key={target.id} name={`interaction:${target.id}`} position={target.position}>
          <InteractionModel target={target} />
          <mesh rotation-x={-Math.PI / 2} position={[0, 0.035, 0]}>
            <ringGeometry args={nearbyId === target.id ? [1.05, 1.28, 32] : [0.92, 1.02, 32]} />
            <meshBasicMaterial color={nearbyId === target.id ? "#e4c779" : "#9c927b"} transparent opacity={nearbyId === target.id ? 0.8 : 0.35} depthWrite={false} />
          </mesh>
          <Html position={[0, target.kind === "npc" ? 2.35 : 2.8, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
            <span className="world-interaction-label">{target.name}</span>
          </Html>
        </group>
      ))}
    </group>
  );
}
