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

/**
 * Atmospheric baseline tuned away from the overly hazy/near-white CI captures.
 * Final color/exposure acceptance still requires the authored temple environment.
 */
export function SkyAtmosphere({ profile, enabled = true }: SkyAtmosphereProps) {
  if (!shouldRenderAtmosphericSky(profile, enabled)) return null;
  return (
    <Sky
      distance={450000}
      sunPosition={profile.sunPosition}
      turbidity={2.0}
      rayleigh={1.2}
      mieCoefficient={0.001}
      mieDirectionalG={0.8}
    />
  );
}
