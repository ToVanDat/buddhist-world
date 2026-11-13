import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldEnvironment } from "../../stores/worldEnvironment";

export interface WetSurfaceParameters {
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
}

export function resolveWetnessIntensity(weather: "clear" | "cloudy" | "rain" | "fog" | undefined, intensity: number): number {
  return weather === "rain" && Number.isFinite(intensity) ? THREE.MathUtils.clamp(intensity, 0, 1) : 0;
}

export function resolveWetSurfaceParameters(
  baseRoughness: number,
  baseClearcoat: number,
  weather: "clear" | "cloudy" | "rain" | "fog",
  intensity: number,
): WetSurfaceParameters {
  const wetness = resolveWetnessIntensity(weather, intensity);
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
  map?: THREE.Texture;
  bumpMap?: THREE.Texture;
  bumpScale?: number;
  roughnessMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  normalScale?: THREE.Vector2;
  displacementMap?: THREE.Texture;
  displacementScale?: number;
  displacementBias?: number;
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
  map,
  bumpMap,
  bumpScale = 0.04,
  roughnessMap,
  normalMap,
  normalScale,
  displacementMap,
  displacementScale = 0,
  displacementBias = 0,
}: WeatherReactiveMaterialProps) {
  const material = useRef<THREE.MeshPhysicalMaterial>(null);
  const snapshot = useWorldEnvironment((state) => state.snapshot);

  const wetness = useRef(0);

  useFrame((_, delta) => {
    if (!material.current) return;
    const targetWetness = resolveWetnessIntensity(snapshot?.weather, snapshot?.weatherIntensity ?? 0);
    wetness.current = THREE.MathUtils.damp(wetness.current, targetWetness, 1.6, delta);
    const params = resolveWetSurfaceParameters(
      baseRoughness,
      baseClearcoat,
      "rain",
      wetness.current,
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
      map={map}
      bumpMap={bumpMap}
      bumpScale={bumpScale}
      roughnessMap={roughnessMap}
      normalMap={normalMap}
      normalScale={normalScale}
      displacementMap={displacementMap}
      displacementScale={displacementScale}
      displacementBias={displacementBias}
    />
  );
}
