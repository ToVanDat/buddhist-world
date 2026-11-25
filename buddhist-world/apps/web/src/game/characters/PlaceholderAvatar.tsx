import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * PLACEHOLDER – không phải asset cuối cùng.
 * Chuyển động procedural chỉ giúp kiểm thử locomotion state trước khi có GLB rigged.
 * Khi có GLB, thay renderer này bằng AnimationMixer nhưng giữ nguyên motion contract.
 */
export type AvatarMotion = "idle" | "walk" | "run" | "jump" | "talk" | "pray" | "work" | "rest" | "meditate" | "prostrate" | "incense" | "ringBell";

export function PlaceholderAvatar({
  color,
  getMotion,
}: {
  color: string;
  getMotion?: () => AvatarMotion;
}) {
  const body = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null);
  const rightLeg = useRef<Group>(null);
  const previousMotion = useRef<AvatarMotion>("idle");
  const actionStartedAt = useRef(0);
  const incenseStick = useRef<Group>(null);

  useFrame(({ clock }, dt) => {
    const motion = getMotion?.() ?? "idle";
    if (motion !== previousMotion.current) { previousMotion.current = motion; actionStartedAt.current = clock.elapsedTime; }
    const actionProgress = Math.min(1, Math.max(0, (clock.elapsedTime - actionStartedAt.current) / 5.2));
    const bow = motion === "prostrate" ? Math.sin(actionProgress * Math.PI) : 0;
    const moving = motion === "walk" || motion === "run";
    const seated = motion === "meditate";
    const bowing = motion === "prostrate";
    const offering = motion === "incense" || motion === "ringBell";
    if (incenseStick.current) incenseStick.current.visible = motion === "incense";
    const cadence = motion === "run" ? 12 : 7.5;
    const phase = clock.elapsedTime * (moving ? cadence : 2.2);
    const swing = moving ? Math.sin(phase) * (motion === "run" ? 0.72 : 0.48) : 0;
    const bob = motion === "jump"
      ? 0.08
      : moving ? Math.abs(Math.sin(phase * 2)) * 0.075 : seated ? Math.sin(phase) * 0.018 : Math.sin(phase) * 0.012;
    const blend = 1 - Math.exp(-14 * Math.min(dt, 0.05));

    if (body.current) {
      const bodyOffset = seated ? -0.38 : bowing ? -0.24 * bow : bob;
      body.current.position.y += (bodyOffset - body.current.position.y) * blend;
      const lean = bowing ? bow * 1.42 : offering ? -0.08 : motion === "run" ? -0.12 : motion === "walk" ? -0.06 : 0;
      body.current.rotation.x += (lean - body.current.rotation.x) * blend;
    }

    const armSwing = motion === "jump" ? -0.85 : seated ? -0.18 : bowing ? 0.55 * bow : offering ? -0.7 : swing;
    const legSwing = seated ? -1.15 : bowing ? -0.3 * bow : motion === "jump" ? 0.25 : -swing;
    if (leftArm.current) leftArm.current.rotation.x += (armSwing - leftArm.current.rotation.x) * blend;
    if (rightArm.current) rightArm.current.rotation.x += (-armSwing - rightArm.current.rotation.x) * blend;\n    if (leftArm.current) leftArm.current.rotation.y += ((bowing ? 0.62 : 0) - leftArm.current.rotation.y) * blend;\n    if (rightArm.current) rightArm.current.rotation.y += ((bowing ? -0.62 : 0) - rightArm.current.rotation.y) * blend;
    if (leftLeg.current) leftLeg.current.rotation.x += (legSwing - leftLeg.current.rotation.x) * blend;
    if (rightLeg.current) rightLeg.current.rotation.x += (-legSwing - rightLeg.current.rotation.x) * blend;
    if (body.current) body.current.position.y += ((seated ? -0.38 : 0) - body.current.position.y) * blend;
  });

  return (
    <group>
      <group ref={body}>
        <mesh castShadow position={[0, 0, 0]}>
          <capsuleGeometry args={[0.35, 0.9, 6, 12]} />
          <meshStandardMaterial color={color} roughness={0.85} />
        </mesh>
        <mesh castShadow position={[0, 0.35, 0.34]}>
          <boxGeometry args={[0.12, 0.12, 0.16]} />
          <meshStandardMaterial color="#3a342b" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.78, 0]}>
          <sphereGeometry args={[0.22, 12, 10]} />
          <meshStandardMaterial color="#b98f70" roughness={0.9} />
        </mesh>
        <group ref={leftArm} position={[-0.38, 0.28, 0]}>
          <mesh castShadow position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.105, 0.34, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
        </group>
        <group ref={rightArm} position={[0.38, 0.28, 0]}>
          <mesh castShadow position={[0, -0.22, 0]}>
            <capsuleGeometry args={[0.105, 0.34, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.85} />
          </mesh>
          <group ref={incenseStick} visible={false} position={[0, -0.48, 0.1]} rotation-z={-0.16}>
            <mesh castShadow>
              <cylinderGeometry args={[0.012, 0.012, 0.32, 6]} />
              <meshStandardMaterial color="#7b4b2d" roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.17, 0]}>
              <sphereGeometry args={[0.035, 8, 8]} />
              <meshBasicMaterial color="#ff9b48" />
            </mesh>
          </group>
        </group>
        <group ref={leftLeg} position={[-0.17, -0.58, 0]}>
          <mesh castShadow position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.12, 0.36, 4, 8]} />
            <meshStandardMaterial color="#51483e" roughness={0.9} />
          </mesh>
        </group>
        <group ref={rightLeg} position={[0.17, -0.58, 0]}>
          <mesh castShadow position={[0, -0.2, 0]}>
            <capsuleGeometry args={[0.12, 0.36, 4, 8]} />
            <meshStandardMaterial color="#51483e" roughness={0.9} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
