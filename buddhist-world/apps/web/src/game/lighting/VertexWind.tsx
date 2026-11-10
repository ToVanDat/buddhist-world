import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { resolveWeatherWind } from "./WeatherLighting";

export type VertexWindWeather = "clear" | "cloudy" | "rain" | "fog";

export interface VertexWindUniformState {
  time: number;
  directionX: number;
  directionZ: number;
  strength: number;
}

export function resolveVertexWindUniformState(
  weather: VertexWindWeather,
  intensity: number,
  time: number,
): VertexWindUniformState {
  const amount = THREE.MathUtils.clamp(intensity, 0, 1);
  const direction = resolveWeatherWind(weather, amount);
  const length = Math.hypot(direction.x, direction.z) || 1;
  const weatherScale = weather === "rain" ? 1 : weather === "cloudy" ? 0.72 : weather === "fog" ? 0.38 : 0.58;
  return {
    time: Number.isFinite(time) ? time : 0,
    directionX: direction.x / length,
    directionZ: direction.z / length,
    strength: THREE.MathUtils.clamp((0.18 + amount * 0.82) * weatherScale, 0, 1),
  };
}

export function injectVertexWindShader(vertexShader: string): string {
  const common = "#include <common>";
  const begin = "#include <begin_vertex>";
  if (!vertexShader.includes(common) || !vertexShader.includes(begin)) return vertexShader;

  const uniforms = `${common}
uniform float uBwWindTime;
uniform float uBwWindStrength;
uniform float uBwWindAmplitude;
uniform vec2 uBwWindDirection;`;
  const deformation = `${begin}
float bwWindWeight = 0.35;
#ifdef USE_COLOR
  bwWindWeight = max(color.r, 0.0);
#endif
float bwWindHeight = clamp(abs(position.y) * 0.2, 0.05, 1.0);
float bwWindPhase = dot(position.xz, uBwWindDirection) * 0.7 + position.y * 0.35;
float bwWindWave = sin(uBwWindTime * 1.4 + bwWindPhase) * 0.72;
float bwWindGust = sin(uBwWindTime * 0.47 + bwWindPhase * 0.19) * 0.28;
float bwWindBend = (bwWindWave + bwWindGust) * uBwWindStrength * uBwWindAmplitude * bwWindWeight * bwWindHeight;
transformed.x += uBwWindDirection.x * bwWindBend;
transformed.z += uBwWindDirection.y * bwWindBend;
transformed.y += abs(bwWindBend) * 0.08;`;
  return vertexShader.replace(common, uniforms).replace(begin, deformation);
}

export function createVertexWindMaterial<T extends THREE.Material>(source: T, amplitude = 0.035): T {
  const material = source.clone() as T;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBwWindTime = { value: 0 };
    shader.uniforms.uBwWindStrength = { value: 0 };
    shader.uniforms.uBwWindAmplitude = { value: amplitude };
    shader.uniforms.uBwWindDirection = { value: new THREE.Vector2(1, 0) };
    shader.vertexShader = injectVertexWindShader(shader.vertexShader);
    material.userData.bwVertexWindShader = shader;
  };
  material.customProgramCacheKey = () => "bw-vertex-wind-v1";
  material.userData.bwVertexWindAmplitude = amplitude;
  return material;
}

export function updateVertexWindMaterial(material: THREE.Material, state: VertexWindUniformState) {
  const uniforms = material.userData.bwVertexWindShader?.uniforms;
  if (!uniforms) return;
  uniforms.uBwWindTime.value = state.time;
  uniforms.uBwWindStrength.value = state.strength;
  uniforms.uBwWindDirection.value.set(state.directionX, state.directionZ);
}

export function VertexWind({
  object,
  amplitude = 0.035,
}: {
  object: THREE.Object3D;
  amplitude?: number;
}) {
  const prepared = useMemo(() => {
    const clone = object.clone(true);
    const materials: THREE.Material[] = [];
    clone.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const source = mesh.material;
      if (Array.isArray(source)) {
        mesh.material = source.map((entry) => {
          const material = createVertexWindMaterial(entry, amplitude);
          materials.push(material);
          return material;
        });
      } else {
        const material = createVertexWindMaterial(source, amplitude);
        materials.push(material);
        mesh.material = material;
      }
    });
    return { object: clone, materials };
  }, [object, amplitude]);
  const snapshot = useWorldEnvironment((state) => state.snapshot);

  useEffect(() => () => {
    for (const material of prepared.materials) material.dispose();
  }, [prepared]);

  useFrame(({ clock }) => {
    const state = resolveVertexWindUniformState(
      snapshot?.weather ?? "clear",
      snapshot?.weatherIntensity ?? 0,
      clock.elapsedTime,
    );
    for (const material of prepared.materials) updateVertexWindMaterial(material, state);
  });

  return <primitive object={prepared.object} />;
}
