import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import type { Group } from "three";
import type { NpcWorldSnapshot } from "@bw/shared";
import { useGame } from "../../stores/game";
import { GLBAvatar } from "./GLBAvatar";

const NPC_MODEL_URL = import.meta.env.VITE_NPC_MODEL_URL?.trim() ?? "";
const NPC_GROUND_OFFSET = 1.2;

function NpcActor({ npc }: { npc: NpcWorldSnapshot }) {
  const root = useRef<Group>(null);
  const torso = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const initialPosition = useMemo(() => {
    const position = npc.state?.position ?? [0, NPC_GROUND_OFFSET, 0];
    return new Vector3(position[0], position[1] - NPC_GROUND_OFFSET, position[2]);
  }, [npc.id]);
  const target = useMemo(() => {
    const position = npc.state?.position ?? [0, NPC_GROUND_OFFSET, 0];
    return new Vector3(position[0], position[1] - NPC_GROUND_OFFSET, position[2]);
  }, [npc.state?.position]);

  useFrame(({ clock }, dt) => {
    if (!root.current || !npc.state) return;
    const safeDt = Math.min(dt, 0.05);
    const blend = 1 - Math.exp(-safeDt * 10);
    root.current.position.lerp(target, 1 - Math.exp(-safeDt * 4.5));
    if (npc.state.heading !== undefined) {
      const yawDelta = Math.atan2(
        Math.sin(npc.state.heading - root.current.rotation.y),
        Math.cos(npc.state.heading - root.current.rotation.y),
      );
      root.current.rotation.y += yawDelta * (1 - Math.exp(-safeDt * 5));
    }

    if (!torso.current) return;
    const t = clock.elapsedTime;
    const activity = npc.state.activity;
    const walking = activity === "walk";
    const gait = walking ? Math.sin(t * 6.2) : 0;
    const bob = walking ? Math.abs(gait) * 0.055
      : activity === "pray" ? Math.sin(t * 0.8) * 0.012
      : Math.sin(t * 1.2) * 0.018;
    torso.current.position.y += (bob - torso.current.position.y) * blend;

    const lean = activity === "pray" ? 0.08 + Math.sin(t * 0.8) * 0.025
      : activity === "rest" ? 0.12
      : activity === "work" ? 0.035
      : walking ? -0.035 : 0;
    torso.current.rotation.x += (lean - torso.current.rotation.x) * blend;

    if (leftArm.current && rightArm.current) {
      const leftTarget = activity === "pray" ? -0.72
        : walking ? gait * 0.32
        : activity === "work" ? Math.sin(t * 3.2) * 0.12 : 0;
      const rightTarget = activity === "pray" ? -0.72
        : walking ? -gait * 0.32
        : activity === "talk" ? -0.35 + Math.sin(t * 3.1) * 0.22
        : activity === "work" ? -0.25 + Math.sin(t * 3.2) * 0.24
        : 0;
      leftArm.current.rotation.x += (leftTarget - leftArm.current.rotation.x) * blend;
      rightArm.current.rotation.x += (rightTarget - rightArm.current.rotation.x) * blend;
      const prayerSpread = activity === "pray" ? 0.12 : 0;
      leftArm.current.rotation.z += (prayerSpread - leftArm.current.rotation.z) * blend;
      rightArm.current.rotation.z += (-prayerSpread - rightArm.current.rotation.z) * blend;
    }
    if (leftLeg.current && rightLeg.current) {
      const leftLegTarget = walking ? -gait * 0.28 : 0;
      const rightLegTarget = walking ? gait * 0.28 : 0;
      leftLeg.current.rotation.x += (leftLegTarget - leftLeg.current.rotation.x) * blend;
      rightLeg.current.rotation.x += (rightLegTarget - rightLeg.current.rotation.x) * blend;
    }
  });

  if (!npc.active || !npc.state) return null;
  const motion = npc.state.activity;
  return (
    <group ref={root} position={initialPosition}>
      {NPC_MODEL_URL ? (
        <GLBAvatar src={NPC_MODEL_URL} getMotion={() => motion} />
      ) : (
        <group ref={torso}>
          <mesh position={[0, 0.86, 0]} castShadow>
            <capsuleGeometry args={[0.34, 0.72, 6, 12]} />
            <meshStandardMaterial color={motion === "pray" ? "#8e6a35" : "#b98a43"} roughness={0.86} />
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
      )}
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
