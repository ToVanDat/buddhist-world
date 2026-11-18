import { Float } from "@react-three/drei";
import { getRegion } from "@bw/shared";
import { useGame } from "../../stores/game";

export function WaypointMarker({ regionId }: { regionId: string }) {
  const waypointId = useGame((state) => state.waypointId);
  const target = getRegion(regionId)?.spawns.find((spawn) => spawn.id === waypointId);
  if (!target) return null;

  return (
    <group name={`waypoint:${target.id}`} position={[target.position[0], 0, target.position[2]]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.06, 0]}>
        <ringGeometry args={[1.05, 1.28, 40]} />
        <meshBasicMaterial color="#d8b96c" transparent opacity={0.72} depthWrite={false} />
      </mesh>
      <Float speed={1.6} rotationIntensity={0.08} floatIntensity={0.22}>
        <mesh position={[0, 2.5, 0]} castShadow>
          <octahedronGeometry args={[0.38, 0]} />
          <meshStandardMaterial color="#e2c77e" emissive="#795a1b" emissiveIntensity={0.35} roughness={0.35} />
        </mesh>
        <mesh position={[0, 1.75, 0]}>
          <cylinderGeometry args={[0.035, 0.035, 1.1, 8]} />
          <meshBasicMaterial color="#d8b96c" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      </Float>
    </group>
  );
}
