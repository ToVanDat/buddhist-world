import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { resolveWindField, sampleWindResponse } from "./WindField";

export interface WindSwayProps {
  children: ReactNode;
  amplitude?: number;
  stiffness?: number;
  phase?: number;
  enabled?: boolean;
}

export interface WindMotionInput {
  time: number;
  amplitude: number;
  stiffness: number;
  intensity: number;
  weather: "clear" | "cloudy" | "rain" | "fog";
  phase?: number;
}

export function resolveWindStrength(
  weather: WindMotionInput["weather"],
  intensity: number,
): number {
  return resolveWindField(weather, intensity, 0).strength;
}

export function sampleWindMotion(input: WindMotionInput) {
  const field = resolveWindField(input.weather, input.intensity, input.time);
  const sway = sampleWindResponse(field, input.phase ?? 0, 1, input.stiffness) * input.amplitude;
  return {
    rotationX: -sway * field.directionZ * 0.32,
    rotationZ: sway * field.directionX,
    response: THREE.MathUtils.clamp(input.stiffness, 0.1, 8),
    strength: field.strength,
  };
}

/** Transform-only wind for visual foliage. Place this group at the asset's local pivot. */
export function WindSway({
  children,
  amplitude = 0.045,
  stiffness = 2.2,
  phase = 0,
  enabled = true,
}: WindSwayProps) {
  const group = useRef<THREE.Group>(null);
  const snapshot = useWorldEnvironment((state) => state.snapshot);

  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    const motion = enabled && snapshot
      ? sampleWindMotion({
          time: clock.elapsedTime,
          amplitude,
          stiffness,
          intensity: snapshot.weatherIntensity,
          weather: snapshot.weather,
          phase,
        })
      : { rotationX: 0, rotationZ: 0, response: stiffness };
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, motion.rotationX, motion.response, delta);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, motion.rotationZ, motion.response, delta);
  });

  return <group ref={group}>{children}</group>;
}
