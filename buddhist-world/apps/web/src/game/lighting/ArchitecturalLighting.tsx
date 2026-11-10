import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSettings } from "../../stores/settings";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { getLightingTransition } from "./LightingController";
import { resolveLightingQuality } from "./LightingProfiles";
import { LightFactory, type RuntimeLightConfig } from "./LightFactory";

export interface ArchitecturalLightDefinition {
  id: string;
  regionId: string;
  priority: number;
  config: RuntimeLightConfig;
}

export function selectArchitecturalLights(
  lights: readonly ArchitecturalLightDefinition[],
  regionId: string,
  maxLights: number,
): ArchitecturalLightDefinition[] {
  return lights
    .filter((light) => light.regionId === regionId)
    .slice()
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, maxLights));
}

/** Converts authoritative sun energy into a smooth local-light dimmer. */
export function getArchitecturalNightFactor(sunIntensity: number): number {
  const darkness = THREE.MathUtils.smoothstep(3 - Math.max(0, sunIntensity), 0.2, 2.5);
  return 0.02 + darkness * 0.98;
}

/**
 * Region-scoped local lights. Fixture coordinates are owned by the region
 * authoring definition; the component only handles quality and day/night.
 */
export function ArchitecturalLighting({
  regionId,
  lights,
}: {
  regionId: string;
  lights: readonly ArchitecturalLightDefinition[];
}) {
  const quality = useSettings((state) => state.quality);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const receivedAt = useWorldEnvironment((state) => state.receivedAt);
  const groupRef = useRef<THREE.Group>(null);
  const qualityProfile = resolveLightingQuality(quality);
  const activeLights = useMemo(
    () => selectArchitecturalLights(lights, regionId, qualityProfile.maxLocalLights),
    [lights, regionId, qualityProfile.maxLocalLights],
  );

  useFrame(() => {
    if (!groupRef.current) return;
    let sunIntensity = 3;
    if (snapshot && receivedAt !== null) {
      const elapsed = Math.max(0, Date.now() - receivedAt);
      const transition = Math.min(1, snapshot.transition + elapsed / 3_600_000);
      sunIntensity = getLightingTransition(snapshot.fromPreset, snapshot.toPreset, transition).sunIntensity;
    }
    const multiplier = getArchitecturalNightFactor(sunIntensity);
    for (const child of groupRef.current.children) {
      if (!(child instanceof THREE.PointLight || child instanceof THREE.SpotLight)) continue;
      const base = child.userData.architecturalBaseIntensity;
      if (typeof base !== "number") child.userData.architecturalBaseIntensity = child.intensity;
      child.intensity = (typeof base === "number" ? base : child.intensity) * multiplier;
    }
  });

  return (
    <group ref={groupRef} name={`architectural-lighting:${regionId}`}>
      {activeLights.map((light, index) => {
        const config = { ...light.config };
        if (config.kind === "point" || config.kind === "spot") {
          config.castShadow = quality === "ULTRA" && index === 0 && config.castShadow === true;
        }
        return <LightFactory key={light.id} config={config} />;
      })}
    </group>
  );
}
