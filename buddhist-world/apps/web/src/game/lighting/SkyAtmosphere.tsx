import { Sky } from "@react-three/drei";
import type { EnvironmentLightingProfile } from "./LightingProfiles";

export interface SkyAtmosphereProps {
  profile: EnvironmentLightingProfile;
  enabled?: boolean;
}

/** Physically based atmospheric sky dome; scene background remains the low-cost fallback. */
export function SkyAtmosphere({ profile, enabled = true }: SkyAtmosphereProps) {
  if (!enabled) return null;
  return (
    <Sky
      distance={450000}
      sunPosition={profile.sunPosition}
      turbidity={8}
      rayleigh={2}
      mieCoefficient={0.005}
      mieDirectionalG={0.8}
    />
  );
}
