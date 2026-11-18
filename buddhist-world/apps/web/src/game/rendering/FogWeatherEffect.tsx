import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSettings } from "../../stores/settings";
import { useGame } from "../../stores/game";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { resolveWeatherWind } from "../lighting/WeatherLighting";
import type { Quality } from "./quality";

export function resolveFogIntensity(weather: string | undefined, intensity: number): number {
  return weather === "fog" && Number.isFinite(intensity)
    ? THREE.MathUtils.clamp(intensity, 0, 1)
    : 0;
}

export function getFogParticleBudget(quality: Quality): number {
  const budgets: Record<Quality, number> = {
    ULTRA: 260,
    HIGH: 180,
    MEDIUM: 100,
    LOW: 36,
    MOBILE: 28,
  };
  return budgets[quality];
}

const vertexShader = `
  uniform float uTime;
  uniform float uOpacity;
  attribute float aSize;
  attribute float aPhase;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y += sin(uTime * 0.18 + aPhase) * 0.48;
    p.x += sin(uTime * 0.11 + aPhase * 1.7) * 0.28;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSize * (30.0 / max(1.0, -mv.z)), 1.0, 18.0);
    vAlpha = uOpacity * (0.55 + 0.45 * sin(uTime * 0.16 + aPhase));
  }
`;
const fragmentShader = `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float soft = 1.0 - smoothstep(0.08, 0.5, d);
    gl_FragColor = vec4(uColor, soft * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Sparse, low-cost drifting fog wisps. Scene Fog remains the primary atmospheric depth cue. */
export function FogWeatherEffect() {
  const quality = useSettings((state) => state.quality);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const group = useRef<THREE.Group>(null);
  const intensity = useRef(0);
  const geometry = useMemo(() => {
    const count = getFogParticleBudget(quality);
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (((i * 37) % 101) / 101 - 0.5) * 42;
      positions[i * 3 + 1] = (((i * 61) % 103) / 103) * 9 - 2;
      positions[i * 3 + 2] = (((i * 73) % 107) / 107 - 0.5) * 42;
      sizes[i] = 2.5 + (i % 7) * 0.65;
      phases[i] = (i * 2.399963) % (Math.PI * 2);
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    buffer.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    return buffer;
  }, [quality]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color("#c7d5d8") },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }, delta) => {
    const target = resolveFogIntensity(snapshot?.weather, snapshot?.weatherIntensity ?? 0);
    intensity.current = THREE.MathUtils.damp(intensity.current, target, 0.8, Math.min(delta, 0.1));
    material.uniforms["uTime"]!.value = clock.elapsedTime;
    material.uniforms["uOpacity"]!.value = intensity.current * 0.24;
    if (group.current) {
      group.current.visible = intensity.current > 0.015;
      const player = useGame.getState().playerPosition ?? [0, 0, 0];
      group.current.position.set(player[0], player[1], player[2]);
      const wind = resolveWeatherWind("fog", intensity.current);
      group.current.position.x += Math.sin(clock.elapsedTime * 0.12) * wind.speed * 0.4;
      group.current.position.z += Math.cos(clock.elapsedTime * 0.1) * wind.speed * 0.3;
    }
  });

  return (
    <group ref={group} name="weather-fog-drift" visible={false}>
      <points geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
