import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, InstancedMesh, Object3D } from "three";

export interface SmokeEmitterProps {
  /** Local-space position of the ember / incense source. */
  position?: [number, number, number];
  /** Maximum visible particles. Keep this modest for mobile. */
  count?: number;
  /** Rise distance in metres. */
  rise?: number;
  /** Seconds for one particle to travel through the emitter. */
  lifetime?: number;
  /** Ambient wind drift in metres. */
  wind?: [number, number, number];
  enabled?: boolean;
}

/**
 * Shared lightweight particle primitive for incense smoke and future ambient
 * effects. It uses one InstancedMesh draw call; no per-particle React state.
 * This is a stylised real-time smoke approximation, not volumetric simulation.
 */
export function SmokeEmitter({
  position = [0, 0, 0],
  count = 18,
  rise = 1.65,
  lifetime = 5.2,
  wind = [0.035, 0, 0.018],
  enabled = true,
}: SmokeEmitterProps) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const color = useMemo(() => new Color(), []);
  const phases = useMemo(
    () => Array.from({ length: Math.max(1, Math.min(48, count)) }, (_, i) => i / Math.max(1, Math.min(48, count))),
    [count],
  );
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    const instance = mesh.current;
    if (!instance) return;
    elapsed.current = (elapsed.current + Math.min(delta, 0.05)) % lifetime;
    if (!enabled) {
      instance.visible = false;
      return;
    }
    instance.visible = true;
    const total = phases.length;
    phases.forEach((offset, index) => {
      const phase = (elapsed.current / lifetime + offset) % 1;
      const envelope = Math.sin(Math.PI * phase);
      const sway = Math.sin(elapsed.current * 1.7 + index * 2.13);
      dummy.position.set(
        position[0] + wind[0] * phase * 5 + sway * (0.025 + phase * 0.075),
        position[1] + phase * rise,
        position[2] + wind[2] * phase * 5 + Math.cos(elapsed.current * 1.1 + index) * 0.025,
      );
      const scale = (0.035 + phase * 0.115) * (0.55 + envelope * 0.45);
      dummy.scale.set(scale * (0.85 + (index % 3) * 0.12), scale * 1.45, scale);
      dummy.rotation.set(0, elapsed.current * 0.12 + index, sway * 0.08);
      dummy.updateMatrix();
      instance.setMatrixAt(index, dummy.matrix);
      color.setRGB(0.72 + envelope * 0.12, 0.71 + envelope * 0.12, 0.67 + envelope * 0.13);
      instance.setColorAt(index, color);
    });
    instance.instanceMatrix.needsUpdate = true;
    if (instance.instanceColor) instance.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, phases.length]} position={[0, 0, 0]} frustumCulled={false}>
      <sphereGeometry args={[1, 7, 5]} />
      <meshBasicMaterial color="#c9c5b9" transparent opacity={0.17} depthWrite={false} vertexColors />
    </instancedMesh>
  );
}
