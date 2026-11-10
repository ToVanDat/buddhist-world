import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldEnvironment } from "../../stores/worldEnvironment";

export interface WetSurfaceParameters {
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export function resolveWetSurfaceParameters(
  baseRoughness: number,
  baseClearcoat: number,
  weather: "clear" | "cloudy" | "rain" | "fog",
  intensity: number,
): WetSurfaceParameters {
  const wetness = weather === "rain" ? THREE.MathUtils.clamp(intensity, 0, 1) : 0;
  return {
    roughness: THREE.MathUtils.lerp(baseRoughness, Math.min(baseRoughness, 0.18), wetness),
    clearcoat: THREE.MathUtils.lerp(baseClearcoat, Math.max(baseClearcoat, 0.72), wetness),
    clearcoatRoughness: THREE.MathUtils.lerp(0.32, 0.08, wetness),
  };
}

export interface WeatherReactiveMaterialProps {
  color?: THREE.ColorRepresentation;
  baseRoughness?: number;
  baseMetalness?: number;
  baseClearcoat?: number;
  envMapIntensity?: number;
}

/**
 * Attach to a visual mesh in place of meshStandardMaterial.
 * Rain makes the surface smoother and adds a restrained clearcoat response.
 * It does not create puddle geometry or change collision/navmesh.
 */
export function WeatherReactiveMaterial({
  color = "#77736a",
  baseRoughness = 0.82,
  baseMetalness = 0,
  baseClearcoat = 0.05,
  envMapIntensity = 1,
}: WeatherReactiveMaterialProps) {
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  const snapshot = useWorldEnvironment((state) => state.snapshot);

  useFrame(() => {
    if (!material.current) return;
    const params = resolveWetSurfaceParameters(
      baseRoughness,
      baseClearcoat,
      snapshot?.weather ?? "clear",
      snapshot?.weatherIntensity ?? 0,
    );
    material.current.roughness = params.roughness;
    material.current.clearcoat = params.clearcoat;
    material.current.clearcoatRoughness = params.clearcoatRoughness;
  });

  return (
    <meshPhysicalMaterial
      ref={material}
      color={color}
      roughness={baseRoughness}
      metalness={baseMetalness}
      clearcoat={baseClearcoat}
      clearcoatRoughness={0.32}
      envMapIntensity={envMapIntensity}
    />
  );
}
