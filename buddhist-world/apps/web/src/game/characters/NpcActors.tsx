import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { Group } from "three";
import type { NpcWorldSnapshot } from "@bw/shared";
import { useGame } from "../../stores/game";

function NpcActor({ npc }: { npc: NpcWorldSnapshot }) {
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const initialPosition = useMemo(() => new Vector3(...(npc.state?.position ?? [0, 0, 0])), [npc.id]);
  const target = useMemo(() => new Vector3(...(npc.state?.position ?? [0, 0, 0])), [npc.state?.position]);
  useFrame(({ clock }, dt) => {
    if (!root.current || !torso.current || !npc.state) return;
    const safeDt = Math.min(dt, 0.05);
    root.current.position.lerp(target, 1 - Math.exp(-safeDt * 4.5));
    if (npc.state.heading !== undefined) {
      const yawDelta = Math.atan2(
        Math.sin(npc.state.heading - root.current.rotation.y),
        Math.cos(npc.state.heading - root.current.rotation.y),
      );
      root.current.rotation.y += yawDelta * (1 - Math.exp(-safeDt * 5));
    }
    const t = clock.elapsedTime;
    const walking = npc.state.activity === "walk";
    const gait = walking ? Math.sin(t * 6.2) : 0;
    const bob = walking ? Math.abs(gait) * 0.055
      : npc.state.activity === "pray" ? Math.sin(t * 0.8) * 0.012 : Math.sin(t * 1.2) * 0.018;
    torso.current.position.y = 0.86 + bob;
    torso.current.rotation.x = npc.state.activity === "pray" ? 0.08 + Math.sin(t * 0.8) * 0.025
      : npc.state.activity === "rest" ? 0.12 : walking ? -0.035 : 0;
    if (leftArm.current && rightArm.current) {
      leftArm.current.rotation.x = walking ? gait * 0.32 : 0;
      rightArm.current.rotation.x = walking ? -gait * 0.32 : 0;
    }
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = walking ? -gait * 0.28 : 0;
      rightLeg.current.rotation.x = walking ? gait * 0.28 : 0;
    }
  });
  if (!npc.active || !npc.state) return null;
  return (
    <group ref={root} position={initialPosition}>
      <group ref={torso}>
        <mesh position={[0, 0.86, 0]} castShadow>
          <capsuleGeometry args={[0.34, 0.72, 6, 12]} />
          <meshStandardMaterial color={npc.state.activity === "pray" ? "#8e6a35" : "#b98a43"} roughness={0.86} />
        </mesh>
        <mesh position={[0, 1.72, 0]} castShadow>
          <sphereGeometry args={[0.27, 16, 14]} />
          <meshStandardMaterial color="#d7b28c" roughness={0.9} />
        </mesh>
        <group ref={leftArm} position={[-0.36, 1.28, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.42, 4, 8]} />
            <meshStandardMaterial color="#a87839" roughness={0.9} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.36, 1.28, 0]}>
          <mesh position={[0, -0.24, 0]} castShadow>
            <capsuleGeometry args={[0.085, 0.42, 4, 8]} />
            <meshStandardMaterial color="#a87839" roughness={0.9} />
          </mesh>
        </group>
        <group ref={leftLeg} position={[-0.17, 0.48, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.42, 4, 8]} />
            <meshStandardMaterial color="#76512d" roughness={0.95} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.17, 0.48, 0]}>
          <mesh position={[0, -0.25, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.42, 4, 8]} />
            <meshStandardMaterial color="#76512d" roughness={0.95} />
          </mesh>
        </group>
      </group>
      <Html position={[0, 2.25, 0]} center distanceFactor={12} style={{ pointerEvents: "none" }}>
        <span className="world-interaction-label">{npc.name}</span>
      </Html>
    </group>
  );
}

const fallbackGuide: NpcWorldSnapshot = {
  id: "monk_guide", name: "Chú tiểu hướng dẫn", title: "Người hướng dẫn tham quan", active: true,
  state: { id: "legacy-static", startMinute: 0, endMinute: 1439, regionId: "temple_complex", position: [8, 1.2, -17], activity: "talk" },
  nextChangeMinute: null,
};

export function NpcActors({ regionId }: { regionId: string }) {
  const npcStates = useGame((state) => state.npcStates);
  const npcs = Object.values(npcStates).filter((npc) => npc.state?.regionId === regionId);
  if (!npcStates.monk_guide && regionId === "temple_complex") npcs.push(fallbackGuide);
  return <group name="scheduled-npc-actors">{npcs.map((npc) => <NpcActor key={npc.id} npc={npc} />)}</group>;
}
