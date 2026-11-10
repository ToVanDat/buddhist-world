import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { resolveWeatherWind } from "./WeatherLighting";

export interface BranchBoneWindConfig {
  weight: number;
  stiffness: number;
  phase: number;
  axisX: number;
  axisY: number;
  axisZ: number;
}

export interface BranchBoneWindInput {
  time: number;
  strength: number;
  directionX: number;
  directionZ: number;
  config: BranchBoneWindConfig;
}

const ROOT_NAME = /(root|trunk|stem|base)/i;
const PRIMARY_BRANCH = /(branch|limb|bough|primary)/i;
const SECONDARY_BRANCH = /(secondary|tertiary|twig|sprig|leaf|foliage)/i;

export function classifyBranchWindBone(
  name: string,
  metadata: Record<string, unknown> = {},
): BranchBoneWindConfig {
  const normalized = name.toLowerCase();
  const weight = typeof metadata.windWeight === "number"
    ? THREE.MathUtils.clamp(metadata.windWeight, 0, 1)
    : ROOT_NAME.test(normalized) ? 0.06
      : SECONDARY_BRANCH.test(normalized) ? 0.88
        : PRIMARY_BRANCH.test(normalized) ? 0.48 : 0.28;
  const stiffness = typeof metadata.windStiffness === "number"
    ? THREE.MathUtils.clamp(metadata.windStiffness, 0.25, 12)
    : ROOT_NAME.test(normalized) ? 7.5
      : SECONDARY_BRANCH.test(normalized) ? 1.7
        : PRIMARY_BRANCH.test(normalized) ? 3.2 : 2.4;
  const phase = typeof metadata.windPhase === "number"
    ? metadata.windPhase
    : (name.split("").reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 7) >>> 0) / 0xffffffff * Math.PI * 2;
  const axis = Array.isArray(metadata.windAxis) && metadata.windAxis.length === 3
    ? metadata.windAxis.map((value) => typeof value === "number" ? value : 0)
    : [0, 0, 1];
  const axisLength = Math.hypot(axis[0]!, axis[1]!, axis[2]!) || 1;
  return {
    weight,
    stiffness,
    phase: Number.isFinite(phase) ? phase : 0,
    axisX: axis[0]! / axisLength,
    axisY: axis[1]! / axisLength,
    axisZ: axis[2]! / axisLength,
  };
}

export function resolveBranchBoneWind(input: BranchBoneWindInput) {
  const { time, strength, directionX, directionZ, config } = input;
  const amount = THREE.MathUtils.clamp(strength, 0, 1) * config.weight;
  const slow = Math.sin(time * 0.62 + config.phase) * 0.58;
  const gustEnvelope = 0.5 + 0.5 * Math.sin(time * 0.17 + config.phase * 0.31);
  const gust = Math.sin(time * 1.47 + config.phase * 1.8) * 0.32 * gustEnvelope;
  const flutter = Math.sin(time * 3.1 + config.phase * 2.7) * 0.1;
  const bend = (slow + gust + flutter) * amount;
  const crossWind = directionX * config.axisZ - directionZ * config.axisX;
  return {
    angleX: bend * (directionZ * 0.22 + config.axisX * 0.18),
    angleY: bend * crossWind * 0.12,
    angleZ: bend * (directionX * 0.72 + config.axisZ * 0.16),
    response: config.stiffness,
  };
}

export function BranchBoneWind({
  object,
  enabled = true,
  amplitude = 0.18,
}: {
  object: THREE.Object3D;
  enabled?: boolean;
  amplitude?: number;
}) {
  const prepared = useMemo(() => {
    const clone = cloneSkeleton(object);
    const bones: Array<{
      bone: THREE.Bone;
      base: THREE.Quaternion;
      target: THREE.Quaternion;
      config: BranchBoneWindConfig;
    }> = [];
    clone.traverse((child) => {
      const bone = child as THREE.Bone;
      if (!bone.isBone) return;
      const config = classifyBranchWindBone(bone.name, bone.userData);
      bones.push({
        bone,
        base: bone.quaternion.clone(),
        target: new THREE.Quaternion(),
        config,
      });
    });
    return { object: clone, bones };
  }, [object]);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const scratch = useMemo(() => ({
    euler: new THREE.Euler(),
    offset: new THREE.Quaternion(),
    target: new THREE.Quaternion(),
  }), []);

  useEffect(() => () => {
    prepared.bones.length = 0;
  }, [prepared]);

  useFrame(({ clock }, delta) => {
    const weather = snapshot?.weather ?? "clear";
    const intensity = snapshot?.weatherIntensity ?? 0;
    const direction = resolveWeatherWind(weather, intensity);
    const length = Math.hypot(direction.x, direction.z) || 1;
    const strength = enabled
      ? THREE.MathUtils.clamp((0.18 + THREE.MathUtils.clamp(intensity, 0, 1) * 0.82) *
        (weather === "rain" ? 1 : weather === "cloudy" ? 0.72 : weather === "fog" ? 0.38 : 0.58), 0, 1)
      : 0;
    const time = clock.elapsedTime;
    for (const entry of prepared.bones) {
      const motion = resolveBranchBoneWind({
        time,
        strength,
        directionX: direction.x / length,
        directionZ: direction.z / length,
        config: entry.config,
      });
      scratch.euler.set(
        motion.angleX * amplitude,
        motion.angleY * amplitude,
        motion.angleZ * amplitude,
      );
      scratch.offset.setFromEuler(scratch.euler);
      scratch.target.copy(entry.base).multiply(scratch.offset);
      entry.bone.quaternion.slerp(scratch.target, 1 - Math.exp(-motion.response * delta));
    }
  });

  return <primitive object={prepared.object} />;
}
