import { useSettings } from "../../stores/settings";
import { LightingManager, type LightingPreset } from "../lighting/LightingManager";

export type CinematicLightingPreset = LightingPreset;

/** Backwards-compatible adapter; LightingManager owns the actual runtime system. */
export function CinematicLighting({
  preset = "day",
  shadows = true,
  fogEnabled = true,
  shadowMapSize = 2048,
}: {
  preset?: CinematicLightingPreset;
  shadows?: boolean;
  fogEnabled?: boolean;
  shadowMapSize?: number;
}) {
  const quality = useSettings((state) => state.quality);
  return (
    <LightingManager
      preset={preset}
      quality={quality}
      shadowsEnabled={shadows}
      fogEnabled={fogEnabled}
      shadowMapSizeOverride={shadowMapSize}
    />
  );
}
