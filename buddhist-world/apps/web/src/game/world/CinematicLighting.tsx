import { useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import * as THREE from "three";

export type CinematicLightingPreset = "dawn" | "day" | "sunset" | "night";

type Preset = {
  background: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  ambient: number;
  hemisphere: number;
  sun: number;
  sunColor: string;
  sunPosition: [number, number, number];
  exposure: number;
};

export const CINEMATIC_LIGHTING_PRESETS: Record<CinematicLightingPreset, Preset> = {
  dawn: {
    background: "#9b8790", fog: "#b9a2a0", fogNear: 38, fogFar: 250,
    ambient: 0.42, hemisphere: 0.62, sun: 2.1, sunColor: "#ffd0a1",
    sunPosition: [-80, 32, 55], exposure: 1.05,
  },
  day: {
    background: "#9bb8cc", fog: "#b8c9c9", fogNear: 65, fogFar: 330,
    ambient: 0.34, hemisphere: 0.78, sun: 3.0, sunColor: "#fff1d6",
    sunPosition: [75, 105, 45], exposure: 1.0,
  },
  sunset: {
    background: "#80616b", fog: "#c18a76", fogNear: 30, fogFar: 220,
    ambient: 0.38, hemisphere: 0.55, sun: 2.35, sunColor: "#ffad78",
    sunPosition: [95, 24, -65], exposure: 1.08,
  },
  night: {
    background: "#101a2c", fog: "#26374a", fogNear: 18, fogFar: 150,
    ambient: 0.16, hemisphere: 0.3, sun: 0.12, sunColor: "#9ab8e8",
    sunPosition: [-35, 70, -20], exposure: 0.82,
  },
};

export function CinematicLighting({ preset = "day", shadows = true, fogEnabled = true, shadowMapSize = 2048 }: { preset?: CinematicLightingPreset; shadows?: boolean; fogEnabled?: boolean; shadowMapSize?: number }) {
  const config = CINEMATIC_LIGHTING_PRESETS[preset];
  const { scene, gl } = useThree();
  const fog = useMemo(
    () => new THREE.Fog(config.fog, config.fogNear, config.fogFar),
    [config.fog, config.fogNear, config.fogFar],
  );

  useEffect(() => {
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousExposure = gl.toneMappingExposure;
    const previousToneMapping = gl.toneMapping;
    scene.background = new THREE.Color(config.background);
    scene.fog = fogEnabled ? fog : null;
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = config.exposure;
    return () => {
      scene.background = previousBackground;
      scene.fog = previousFog;
      gl.toneMappingExposure = previousExposure;
      gl.toneMapping = previousToneMapping;
    };
  }, [scene, gl, config, fog, fogEnabled]);

  return (
    <>
      <hemisphereLight args={[config.background, "#343126", config.hemisphere]} />
      <ambientLight intensity={config.ambient} />
      <directionalLight
        castShadow={shadows}
        color={config.sunColor}
        intensity={config.sun}
        position={config.sunPosition}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={360}
        shadow-camera-left={-140}
        shadow-camera-right={140}
        shadow-camera-top={140}
        shadow-camera-bottom={-140}
        shadow-bias={-0.00012}
        shadow-normalBias={0.025}
      />
    </>
  );
}
