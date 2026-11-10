import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useSettings } from "../../stores/settings";
import { useGame } from "../../stores/game";
import { useWorldEnvironment } from "../../stores/worldEnvironment";
import type { Quality } from "./quality";

export function getRainParticleBudget(quality: Quality): number {
  const budgets: Record<Quality, number> = {
    ULTRA: 900,
    HIGH: 600,
    MEDIUM: 300,
    LOW: 100,
    MOBILE: 120,
  };
  return budgets[quality];
}

/** Lightweight, client-only rain streaks; authoritative weather comes from the server snapshot. */
export function RainWeatherEffect() {
  const quality = useSettings((state) => state.quality);
  const snapshot = useWorldEnvironment((state) => state.snapshot);
  const groupRef = useRef<THREE.Group>(null);
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
    const intensity = Math.max(0, Math.min(1, snapshot?.weatherIntensity ?? 0));
    if (weather !== "rain" || intensity <= 0.01) {
      group.visible = false;
      geometry.setDrawRange(0, 0);
      return;
    }

    group.visible = true;
    const playerPosition = useGame.getState().playerPosition ?? [0, 0, 0];
    group.position.set(playerPosition[0], playerPosition[1], playerPosition[2]);
    const count = Math.floor(getRainParticleBudget(quality) * intensity);
    geometry.setDrawRange(0, count * 2);
    material.opacity = 0.18 + intensity * 0.42;

    const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
    const positions = attribute.array as Float32Array;
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < count; i += 1) {
      const offset = i * 6;
      let x = positions[offset] ?? 0;
      let y = positions[offset + 1] ?? 0;
      let z = positions[offset + 2] ?? 0;
      y -= (14 + (i % 11) * 0.45) * dt;
      x += 1.6 * intensity * dt;
      z += 0.65 * intensity * dt;
      if (y < -5) {
        y = 17 + ((i * 37) % 100) / 10;
        x = (((i * 17) % 101) / 101 - 0.5) * 36;
        z = (((i * 29) % 107) / 107 - 0.5) * 36;
      }
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x + 0.025 + 0.035 * intensity;
      positions[offset + 4] = y - 0.42;
      positions[offset + 5] = z + 0.012;
    }
    attribute.needsUpdate = true;
  });

  return (
    <group ref={groupRef} name="weather-rain" visible={false}>
      <lineSegments geometry={geometry} material={material} frustumCulled={false} />
    </group>
  );
}
