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
  const initialPosition = useMemo(() => new Vector3(...(npc.state?.position ?? [0, 0, 0])), [npc.id]);
  const target = useMemo(() => new Vector3(...(npc.state?.position ?? [0, 0, 0])), [npc.state?.position]);
  useFrame(({ clock }, dt) => {
    if (!root.current || !torso.current || !npc.state) return;
    root.current.position.lerp(target, 1 - Math.exp(-Math.min(dt, 0.05) * 2.8));
    root.current.rotation.y = npc.state.heading ?? root.current.rotation.y;
    const t = clock.elapsedTime;
    const activity = npc.state.activity;
    const bob = activity === "walk" ? Math.abs(Math.sin(t * 5.5)) * 0.045
      : activity === "pray" ? Math.sin(t * 0.8) * 0.012 : Math.sin(t * 1.2) * 0.018;
    torso.current.position.y = 0.86 + bob;
    torso.current.rotation.x = activity === "pray" ? 0.08 + Math.sin(t * 0.8) * 0.025
      : activity === "rest" ? 0.12 : 0;
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
