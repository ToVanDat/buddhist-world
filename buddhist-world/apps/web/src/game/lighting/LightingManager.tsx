import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Quality } from "../rendering/quality";
import { ENVIRONMENT_LIGHTING_PROFILES, resolveLightingQuality, type LightingPreset } from "./LightingProfiles";
import { LightFactory } from "./LightFactory";

export type { LightingPreset } from "./LightingProfiles";

export interface LightingManagerProps {
  preset?: LightingPreset;
  quality: Quality;
  fogEnabled?: boolean;
  shadowsEnabled?: boolean;
  exposureOverride?: number;
}

/** Owns scene-level environment lighting and renderer color/exposure state. */
export function LightingManager({
  preset = "day",
  quality,
  fogEnabled,
  shadowsEnabled,
  exposureOverride,
}: LightingManagerProps) {
  const profile = ENVIRONMENT_LIGHTING_PROFILES[preset];
  const qualityProfile = resolveLightingQuality(quality);
  const { scene, gl } = useThree();
  const useFog = fogEnabled ?? qualityProfile.fog;
  const useShadows = shadowsEnabled ?? qualityProfile.shadows;
  const fog = useMemo(
    () => new THREE.Fog(profile.fogColor, profile.fogNear, profile.fogFar),
    [profile.fogColor, profile.fogNear, profile.fogFar],
  );

  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousExposure = gl.toneMappingExposure;
    const previousToneMapping = gl.toneMapping;
    scene.background = new THREE.Color(profile.background);
    scene.fog = useFog ? fog : null;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposureOverride ?? profile.exposure;
    return () => {
      scene.background = previousBackground;
      scene.fog = previousFog;
      gl.toneMappingExposure = previousExposure;
      gl.toneMapping = previousToneMapping;
    };
  }, [scene, gl, profile, fog, useFog, exposureOverride]);

  return (
    <>
      <LightFactory config={{
        kind: "hemisphere",
        skyColor: profile.background,
        groundColor: "#343126",
        intensity: profile.hemisphereIntensity * qualityProfile.environmentIntensity,
      }} />
      <LightFactory config={{
        kind: "ambient",
        color: "#ffffff",
        intensity: profile.ambientIntensity * qualityProfile.environmentIntensity,
      }} />
      <LightFactory config={{
        kind: "directional",
        color: profile.sunColor,
        intensity: profile.sunIntensity,
        position: profile.sunPosition,
        castShadow: useShadows,
        shadowMapSize: qualityProfile.shadowMapSize,
        shadowBounds: profile.shadowCameraBounds,
      }} />
    </>
  );
}
