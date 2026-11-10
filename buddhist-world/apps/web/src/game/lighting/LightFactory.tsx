import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";

export type DirectionalLightConfig = {
  kind: "directional";
  color: string;
  intensity: number;
  position: [number, number, number];
  castShadow?: boolean;
  shadowMapSize?: number;
  shadowBounds?: number;
};

export type PointLightConfig = {
  kind: "point";
  color: string;
  intensity: number;
  position: [number, number, number];
  distance?: number;
  decay?: number;
  castShadow?: boolean;
};

export type SpotLightConfig = {
  kind: "spot";
  color: string;
  intensity: number;
  position: [number, number, number];
  target: [number, number, number];
  distance?: number;
  angle?: number;
  penumbra?: number;
  decay?: number;
  castShadow?: boolean;
};

export type AmbientLightConfig = {
  kind: "ambient";
  color: string;
  intensity: number;
};

export type HemisphereLightConfig = {
  kind: "hemisphere";
  skyColor: string;
  groundColor: string;
  intensity: number;
};

export type RuntimeLightConfig =
  | DirectionalLightConfig
  | PointLightConfig
  | SpotLightConfig
  | AmbientLightConfig
  | HemisphereLightConfig;

function SpotRuntimeLight({ config }: { config: SpotLightConfig }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    target.position.set(...config.target);
    target.updateMatrixWorld();
  }, [target, config.target]);
  return (
    <>
      <primitive object={target} />
      <spotLight
        color={config.color}
        intensity={config.intensity}
        position={config.position}
        target={target}
        distance={config.distance ?? 0}
        angle={config.angle ?? Math.PI / 5}
        penumbra={config.penumbra ?? 0.5}
        decay={config.decay ?? 2}
        castShadow={config.castShadow ?? false}
      />
    </>
  );
}

/** Reusable declarative light factory. Area lights remain Blender/baked authoring lights in WebGL. */
export function LightFactory({ config }: { config: RuntimeLightConfig }): ReactNode {
  switch (config.kind) {
    case "directional":
      return (
        <directionalLight
          color={config.color}
          intensity={config.intensity}
          position={config.position}
          castShadow={config.castShadow ?? false}
          shadow-mapSize-width={config.shadowMapSize ?? 1024}
          shadow-mapSize-height={config.shadowMapSize ?? 1024}
          shadow-camera-near={1}
          shadow-camera-far={400}
          shadow-camera-left={-(config.shadowBounds ?? 100)}
          shadow-camera-right={config.shadowBounds ?? 100}
          shadow-camera-top={config.shadowBounds ?? 100}
          shadow-camera-bottom={-(config.shadowBounds ?? 100)}
          shadow-bias={-0.00012}
          shadow-normalBias={0.025}
        />
      );
    case "point":
      return (
        <pointLight
          color={config.color}
          intensity={config.intensity}
          position={config.position}
          distance={config.distance ?? 0}
          decay={config.decay ?? 2}
          castShadow={config.castShadow ?? false}
        />
      );
    case "spot":
      return <SpotRuntimeLight config={config} />;
    case "ambient":
      return <ambientLight color={config.color} intensity={config.intensity} />;
    case "hemisphere":
      return <hemisphereLight args={[config.skyColor, config.groundColor, config.intensity]} />;
  }
}
