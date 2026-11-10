import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Quality } from "../rendering/quality";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { ENVIRONMENT_LIGHTING_PROFILES, resolveLightingQuality, type EnvironmentLightingProfile, type LightingPreset } from "./LightingProfiles";
import { getLightingTransition } from "./LightingController";
import { applyWeatherLighting, interpolateLightingProfile } from "./WeatherLighting";
import { SkyAtmosphere } from "./SkyAtmosphere";

export type { LightingPreset } from "./LightingProfiles";

export interface LightingManagerProps {
  preset?: LightingPreset;
  quality: Quality;
  fogEnabled?: boolean;
  shadowsEnabled?: boolean;
  exposureOverride?: number;
  shadowMapSizeOverride?: number;
  skyEnabled?: boolean;
}

/** Owns scene-level environment lighting and renderer color/exposure state. */
export function LightingManager({
  preset = "day",
  quality,
  fogEnabled,
  shadowsEnabled,
  exposureOverride,
  shadowMapSizeOverride,
  skyEnabled,
}: LightingManagerProps) {
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const receivedAt = useWorldEnvironment((state) => state.receivedAt);
  const baseProfile = useMemo(() => {
    if (!snapshot) return ENVIRONMENT_LIGHTING_PROFILES[preset];
    return applyWeatherLighting(
      getLightingTransition(snapshot.fromPreset, snapshot.toPreset, snapshot.transition),
      snapshot.weather,
      snapshot.weatherIntensity,
    );
  }, [preset, snapshot]);
  const qualityProfile = resolveLightingQuality(quality);
  const { scene, gl } = useThree();
  const useFog = fogEnabled ?? qualityProfile.fog;
  const useShadows = shadowsEnabled ?? qualityProfile.shadows;
  const useSky = skyEnabled ?? (quality !== "LOW" && quality !== "MOBILE");
  const shadowMapSize = Math.min(shadowMapSizeOverride ?? qualityProfile.shadowMapSize, qualityProfile.shadowMapSize);
  const fog = useMemo(
    () => new THREE.Fog(baseProfile.fogColor, baseProfile.fogNear, baseProfile.fogFar),
    [baseProfile.fogColor, baseProfile.fogNear, baseProfile.fogFar],
  );
  const backgroundColor = useMemo(() => new THREE.Color(baseProfile.background), [baseProfile.background]);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const smoothedProfile = useRef<EnvironmentLightingProfile>({ ...baseProfile, sunPosition: [...baseProfile.sunPosition] });

  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousExposure = gl.toneMappingExposure;
    const previousToneMapping = gl.toneMapping;
    scene.background = backgroundColor;
    scene.fog = useFog ? fog : null;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = exposureOverride ?? baseProfile.exposure;
    return () => {
      scene.background = previousBackground;
      scene.fog = previousFog;
      gl.toneMappingExposure = previousExposure;
      gl.toneMapping = previousToneMapping;
    };
  }, [scene, gl, baseProfile, fog, backgroundColor, useFog, exposureOverride]);

  useFrame((_, delta) => {
    let current = baseProfile;
    if (snapshot && receivedAt !== null) {
      // World time runs at real-time speed. Extrapolate between authoritative
      // snapshots so transitions remain smooth without per-frame network traffic.
      const elapsed = Math.max(0, Date.now() - receivedAt);
      const transition = Math.min(1, snapshot.transition + elapsed / 3_600_000);
      current = applyWeatherLighting(
        getLightingTransition(snapshot.fromPreset, snapshot.toPreset, transition),
        snapshot.weather,
        snapshot.weatherIntensity,
      );
    }

    smoothedProfile.current = interpolateLightingProfile(smoothedProfile.current, current, delta);
    current = smoothedProfile.current;
    backgroundColor.set(current.background);
    if (scene.background instanceof THREE.Color && scene.background !== backgroundColor) {
      scene.background.copy(backgroundColor);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.set(current.fogColor);
      scene.fog.near = current.fogNear;
      scene.fog.far = current.fogFar;
    }
    if (hemisphereRef.current) {
      hemisphereRef.current.color.set(current.background);
      hemisphereRef.current.intensity = current.hemisphereIntensity * qualityProfile.environmentIntensity;
    }
    if (ambientRef.current) {
      ambientRef.current.intensity = current.ambientIntensity * qualityProfile.environmentIntensity;
    }
    if (sunRef.current) {
      sunRef.current.color.set(current.sunColor);
      sunRef.current.intensity = current.sunIntensity;
      sunRef.current.position.set(...current.sunPosition);
    }
    gl.toneMappingExposure = exposureOverride ?? current.exposure;
  });

  return (
    <>
      <SkyAtmosphere profile={baseProfile} enabled={useSky} />
      <hemisphereLight
        ref={hemisphereRef}
        args={[baseProfile.background, "#343126", baseProfile.hemisphereIntensity * qualityProfile.environmentIntensity]}
      />
      <ambientLight
        ref={ambientRef}
        color="#ffffff"
        intensity={baseProfile.ambientIntensity * qualityProfile.environmentIntensity}
      />
      <directionalLight
        ref={sunRef}
        castShadow={useShadows}
        color={baseProfile.sunColor}
        intensity={baseProfile.sunIntensity}
        position={baseProfile.sunPosition}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={360}
        shadow-camera-left={-baseProfile.shadowCameraBounds}
        shadow-camera-right={baseProfile.shadowCameraBounds}
        shadow-camera-top={baseProfile.shadowCameraBounds}
        shadow-camera-bottom={-baseProfile.shadowCameraBounds}
        shadow-bias={-0.00012}
        shadow-normalBias={0.025}
      />
    </>
  );
}
