import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * PLACEHOLDER – không phải asset cuối cùng.
 * Chuyển động procedural chỉ giúp kiểm thử locomotion state trước khi có GLB rigged.
 * Khi có GLB, thay renderer này bằng AnimationMixer nhưng giữ nguyên motion contract.
 */
export type AvatarMotion = "idle" | "walk" | "run" | "jump" | "talk" | "pray" | "work" | "rest";

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

  useFrame(({ clock }, dt) => {
    const motion = getMotion?.() ?? "idle";
    const moving = motion === "walk" || motion === "run";
    const cadence = motion === "run" ? 12 : 7.5;
    const phase = clock.elapsedTime * (moving ? cadence : 2.2);
    const swing = moving ? Math.sin(phase) * (motion === "run" ? 0.72 : 0.48) : 0;
    const bob = motion === "jump"
      ? 0.08
      : moving ? Math.abs(Math.sin(phase * 2)) * 0.075 : Math.sin(phase) * 0.012;
    const blend = 1 - Math.exp(-14 * Math.min(dt, 0.05));

    if (body.current) {
      body.current.position.y += (bob - body.current.position.y) * blend;
      const lean = motion === "run" ? -0.12 : motion === "walk" ? -0.06 : 0;
      body.current.rotation.x += (lean - body.current.rotation.x) * blend;
    }

    const armSwing = motion === "jump" ? -0.85 : swing;
    const legSwing = motion === "jump" ? 0.25 : -swing;
    if (leftArm.current) leftArm.current.rotation.x += (armSwing - leftArm.current.rotation.x) * blend;
    if (rightArm.current) rightArm.current.rotation.x += (-armSwing - rightArm.current.rotation.x) * blend;
    if (leftLeg.current) leftLeg.current.rotation.x += (legSwing - leftLeg.current.rotation.x) * blend;
    if (rightLeg.current) rightLeg.current.rotation.x += (-legSwing - rightLeg.current.rotation.x) * blend;
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
