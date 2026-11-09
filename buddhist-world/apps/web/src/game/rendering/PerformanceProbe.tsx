import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { usePerformance } from "../../stores/performance";

/** Samples renderer.info once per second; it is a diagnostic, not a benchmark result. */
export function PerformanceProbe() {
  const gl = useThree((state) => state.gl);
  const setSnapshot = usePerformance((state) => state.setSnapshot);
  const sample = useRef({ elapsed: 0, frames: 0 });

  useFrame((_, delta) => {
    sample.current.elapsed += delta;
    sample.current.frames += 1;
    if (sample.current.elapsed < 1) return;

    const elapsed = sample.current.elapsed;
    const frames = sample.current.frames;
    setSnapshot({
      fps: Math.round(frames / elapsed),
      frameMs: Math.round((elapsed / Math.max(frames, 1)) * 1000 * 10) / 10,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
    sample.current = { elapsed: 0, frames: 0 };
  });

  return null;
}
