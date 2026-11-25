import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { isInsideLotusPondFootprint, TEMPLE_LAYOUT } from "@bw/shared";
import { useGame } from "../../stores/game";

interface SplashParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

const PARTICLE_COUNT = 36;

/** Lightweight instanced droplets emitted by moving feet while wading through the lotus pond. */
export function WaterWadingEffects() {
  const playerPosition = useGame((state) => state.playerPosition);
  const previous = useRef<{ x: number; z: number; time: number } | null>(null);
  const spawnClock = useRef(0);
  const cursor = useRef(0);
  const particles = useRef<SplashParticle[]>(Array.from({ length: PARTICLE_COUNT }, () => ({
    position: new THREE.Vector3(0, -100, 0),
    velocity: new THREE.Vector3(),
    life: 0,
    maxLife: 0.38,
  })));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const geometry = useMemo(() => new THREE.SphereGeometry(0.035, 6, 5), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: "#c7e5dc",
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    toneMapped: false,
  }), []);
  const mesh = useMemo(() => {
    const instance = new THREE.InstancedMesh(geometry, material, PARTICLE_COUNT);
    instance.frustumCulled = false;
    return instance;
  }, [geometry, material]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  useFrame(({ clock }, delta) => {
    const now = clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    if (playerPosition && isInsideLotusPondFootprint(playerPosition)) {
      const prior = previous.current;
      if (prior) {
        const elapsed = Math.max(0.001, now - prior.time);
        const dx = playerPosition[0] - prior.x;
        const dz = playerPosition[2] - prior.z;
        const speed = Math.hypot(dx, dz) / elapsed;
        if (speed > 0.55) {
          spawnClock.current += dt;
          if (spawnClock.current >= 0.16) {
            spawnClock.current = 0;
            const length = Math.hypot(dx, dz) || 1;
            const sideX = -dz / length;
            const sideZ = dx / length;
            for (const side of [-1, 1]) {
              const particle = particles.current[cursor.current]!;
              cursor.current = (cursor.current + 1) % PARTICLE_COUNT;
              particle.position.set(
                playerPosition[0] + sideX * side * 0.17,
                TEMPLE_LAYOUT.pond.waterSurfaceY + 0.09,
                playerPosition[2] + sideZ * side * 0.17,
              );
              particle.velocity.set(
                sideX * side * (0.18 + speed * 0.035) - dx / length * 0.08,
                0.72 + (cursor.current % 4) * 0.12,
                sideZ * side * (0.18 + speed * 0.035) - dz / length * 0.08,
              );
              particle.life = particle.maxLife;
            }
          }
        } else {
          spawnClock.current = 0;
        }
      }
      previous.current = { x: playerPosition[0], z: playerPosition[2], time: now };
    } else {
      previous.current = null;
      spawnClock.current = 0;
    }

    particles.current.forEach((particle, index) => {
      if (particle.life > 0) {
        particle.life = Math.max(0, particle.life - dt);
        particle.velocity.y -= 2.7 * dt;
        particle.position.addScaledVector(particle.velocity, dt);
      }
      const alpha = particle.life > 0 ? particle.life / particle.maxLife : 0;
      dummy.position.copy(particle.position);
      dummy.scale.setScalar(alpha * 0.95);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return <primitive object={mesh} />;
}
