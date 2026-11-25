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
  const motion = useRef<{ x: number; z: number; time: number; speed: number; dirX: number; dirZ: number; activeUntil: number } | null>(null);
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
      const prior = motion.current;
      if (!prior) {
        motion.current = { x: playerPosition[0], z: playerPosition[2], time: now, speed: 0, dirX: 0, dirZ: 0, activeUntil: 0 };
      } else {
        const dx = playerPosition[0] - prior.x;
        const dz = playerPosition[2] - prior.z;
        const distance = Math.hypot(dx, dz);
        if (distance > 0.005) {
          const elapsed = Math.max(0.05, now - prior.time);
          const speed = distance / elapsed;
          const nextMotion = {
            x: playerPosition[0], z: playerPosition[2], time: now, speed,
            dirX: dx / distance, dirZ: dz / distance, activeUntil: now + 0.28,
          };
          motion.current = nextMotion;
        } else if (now - prior.time > 0.55) {
          prior.speed = 0;
          prior.activeUntil = 0;
        }
      }
      const currentMotion = motion.current;
      if (currentMotion && now < currentMotion.activeUntil && currentMotion.speed > 0.55) {
        spawnClock.current += dt;
        if (spawnClock.current >= 0.16) {
          spawnClock.current = 0;
          const sideX = -currentMotion.dirZ;
          const sideZ = currentMotion.dirX;
          for (const side of [-1, 1]) {
            const particle = particles.current[cursor.current]!;
            cursor.current = (cursor.current + 1) % PARTICLE_COUNT;
            particle.position.set(
              playerPosition[0] + sideX * side * 0.17,
              TEMPLE_LAYOUT.pond.waterSurfaceY + 0.09,
              playerPosition[2] + sideZ * side * 0.17,
            );
            particle.velocity.set(
              sideX * side * (0.18 + currentMotion.speed * 0.035) - currentMotion.dirX * 0.08,
              0.72 + (cursor.current % 4) * 0.12,
              sideZ * side * (0.18 + currentMotion.speed * 0.035) - currentMotion.dirZ * 0.08,
            );
            particle.life = particle.maxLife;
          }
        }
      } else {
        spawnClock.current = 0;
      }
    } else {
      motion.current = null;
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
