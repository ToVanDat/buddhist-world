import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSettings } from "../../stores/settings";
import { useGame } from "../../stores/game";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import { resolveWeatherWind } from "../lighting/WeatherLighting";
import type { Quality } from "./quality";

export function resolveRainIntensity(weather: string | undefined, intensity: number): number {
  return weather === "rain" && Number.isFinite(intensity)
    ? THREE.MathUtils.clamp(intensity, 0, 1)
    : 0;
}

export function getRainParticleBudget(quality: Quality): number {
  const budgets: Record<Quality, number> = {
    ULTRA: 900,
    HIGH: 600,
    MEDIUM: 300,
    LOW: 100,
    MOBILE: 80,
  };
  return budgets[quality];
}

/** Lightweight, camera-following rain; weather authority stays on the server. */
export function RainWeatherEffect() {
  const quality = useSettings((state) => state.quality);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const groupRef = useRef<THREE.Group>(null);
  const smoothedIntensity = useRef(0);
  const geometry = useMemo(() => {
    const count = getRainParticleBudget(quality);
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i += 1) {
      const x = (((i * 37) % 101) / 101 - 0.5) * 36;
      const y = (((i * 61) % 103) / 103) * 22 - 4;
      const z = (((i * 73) % 107) / 107 - 0.5) * 36;
      const offset = i * 6;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x + 0.025;
      positions[offset + 4] = y - 0.42;
      positions[offset + 5] = z + 0.012;
    }
    const result = new THREE.BufferGeometry();
    result.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    result.setDrawRange(0, 0);
    return result;
  }, [quality]);
  const material = useMemo(() => new THREE.LineBasicMaterial({
    color: "#d7e9f5",
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }), []);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    const weather = snapshot?.weather ?? "clear";
    const targetIntensity = resolveRainIntensity(weather, snapshot?.weatherIntensity ?? 0);
    smoothedIntensity.current = THREE.MathUtils.damp(smoothedIntensity.current, targetIntensity, 1.8, Math.min(delta, 0.1));
    const intensity = smoothedIntensity.current;
    if (intensity <= 0.01) {
      group.visible = false;
      geometry.setDrawRange(0, 0);
      return;
    }

    group.visible = true;
    const playerPosition = useGame.getState().playerPosition ?? [0, 0, 0];
    group.position.set(playerPosition[0], playerPosition[1] + 7, playerPosition[2]);
    const count = Math.floor(getRainParticleBudget(quality) * intensity);
    geometry.setDrawRange(0, count * 2);
    material.opacity = 0.12 + intensity * 0.38;

    const wind = resolveWeatherWind(weather === "rain" ? weather : "clear", intensity);
    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < count; i += 1) {
      const offset = i * 6;
      let x = positions[offset] ?? 0;
      let y = positions[offset + 1] ?? 0;
      let z = positions[offset + 2] ?? 0;
      y -= (14 + (i % 11) * 0.45) * dt;
      x += wind.x * wind.speed * dt;
      z += wind.z * wind.speed * dt;
      if (y < -5) {
        y = 17 + ((i * 37) % 100) / 10;
        x = (((i * 17) % 101) / 101 - 0.5) * 36;
        z = (((i * 29) % 107) / 107 - 0.5) * 36;
      }
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x + 0.025 + wind.x * 0.035;
      positions[offset + 4] = y - 0.42;
      positions[offset + 5] = z + wind.z * 0.012;
    }
    attribute.needsUpdate = true;
  });

  return (
    <group ref={groupRef} name="weather-rain" visible={false}>
      <lineSegments geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
