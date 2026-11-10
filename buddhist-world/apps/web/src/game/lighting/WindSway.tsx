import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldEnvironment } from "../../stores/worldEnvironment";

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
  const amount = THREE.MathUtils.clamp(intensity, 0, 1);
  const baseline = weather === "rain" ? 0.32 : weather === "cloudy" ? 0.24 : weather === "fog" ? 0.12 : 0.18;
  const response = weather === "rain" ? 0.62 : weather === "cloudy" ? 0.28 : weather === "fog" ? 0.12 : 0.12;
  return THREE.MathUtils.clamp(baseline + response * amount, 0, 1);
}

export function sampleWindMotion(input: WindMotionInput) {
  const strength = resolveWindStrength(input.weather, input.intensity);
  const phase = input.phase ?? 0;
  const slow = Math.sin(input.time * 0.72 + phase);
  const gustEnvelope = 0.5 + 0.5 * Math.sin(input.time * 0.19 + phase * 0.37);
  const gust = Math.sin(input.time * 1.83 + phase * 1.7) * 0.32 * gustEnvelope;
  const fine = Math.sin(input.time * 3.7 + phase * 2.3) * 0.08;
  const sway = (slow * 0.62 + gust + fine) * input.amplitude * strength;
  return {
    rotationX: sway * 0.24,
    rotationZ: sway,
    response: THREE.MathUtils.clamp(input.stiffness, 0.1, 8),
    strength,
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
