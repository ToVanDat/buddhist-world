import { Sky } from "@react-three/drei";
import type { EnvironmentLightingProfile } from "./LightingProfiles";

export interface SkyAtmosphereProps {
  profile: EnvironmentLightingProfile;
  enabled?: boolean;
}

/**
 * The procedural daytime sky is intentionally hidden after sunset.
 * Drei's atmospheric sky is sun-driven and does not create a true night sky;
 * leaving it mounted below the horizon still produces a bright sky dome.
 */
export function shouldRenderAtmosphericSky(
  profile: EnvironmentLightingProfile,
  enabled = true,
): boolean {
  return enabled && profile.sunIntensity > 0.2;
}

/** Physically based daytime atmosphere; scene background is the night fallback. */
export function SkyAtmosphere({ profile, enabled = true }: SkyAtmosphereProps) {
  if (!shouldRenderAtmosphericSky(profile, enabled)) return null;
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
