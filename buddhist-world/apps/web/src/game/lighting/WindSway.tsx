import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldEnvironment } from "../../stores/worldEnvironment";

export interface WindSwayProps {
  children: ReactNode;
  /** Maximum local angular displacement in radians. Keep foliage subtle. */
  amplitude?: number;
  /** Higher values follow gust changes more quickly. */
  stiffness?: number;
  /** Deterministic per-instance phase prevents synchronized motion. */
  phase?: number;
  /** Set false for trunks, stone, buildings and other rigid objects. */
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

export function sampleWindMotion(input: WindMotionInput) {
  const weatherScale = input.weather === "rain" ? 1.35 : input.weather === "cloudy" ? 0.85 : input.weather === "fog" ? 0.65 : 1;
  const strength = THREE.MathUtils.clamp(input.intensity, 0, 1) * weatherScale;
  const phase = input.phase ?? 0;
  const slow = Math.sin(input.time * 0.72 + phase);
  const gust = Math.sin(input.time * 1.83 + phase * 1.7) * 0.32;
  const fine = Math.sin(input.time * 3.7 + phase * 2.3) * 0.08;
  const sway = (slow * 0.62 + gust + fine) * input.amplitude * strength;
  const stiffness = THREE.MathUtils.clamp(input.stiffness, 0.1, 8);
  return {
    rotationX: sway * 0.28,
    rotationZ: sway,
    response: stiffness,
  };
}

/**
 * Lightweight transform-based foliage sway. It intentionally does not alter
 * geometry or collision, so it is safe to apply to visual-only vegetation.
 * Use separate groups per tree/cluster and vary phase to avoid synchronized motion.
 */
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
    if (!enabled || !snapshot) {
      group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, 0, stiffness, delta);
      group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, 0, stiffness, delta);
      return;
    }

    const motion = sampleWindMotion({
      time: clock.elapsedTime,
      amplitude,
      stiffness,
      intensity: snapshot.weatherIntensity,
      weather: snapshot.weather,
      phase,
    });
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, motion.rotationX, motion.response, delta);
    group.current.rotation.z = THREE.MathUtils.damp(group.current.rotation.z, motion.rotationZ, motion.response, delta);
  });

  return <group ref={group}>{children}</group>;
}
