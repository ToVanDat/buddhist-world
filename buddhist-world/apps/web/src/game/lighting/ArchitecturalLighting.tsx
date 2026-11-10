import { useMemo } from "react";
import { useSettings } from "../../stores/settings";
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

/** Region-scoped local lights; the caller owns the region lifecycle and source fixtures. */
export function ArchitecturalLighting({
  regionId,
  lights,
}: {
  regionId: string;
  lights: readonly ArchitecturalLightDefinition[];
}) {
  const quality = useSettings((state) => state.quality);
  const qualityProfile = resolveLightingQuality(quality);
  const activeLights = useMemo(
    () => selectArchitecturalLights(lights, regionId, qualityProfile.maxLocalLights),
    [lights, regionId, qualityProfile.maxLocalLights],
  );

  return (
    <group name={`architectural-lighting:${regionId}`}>
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
