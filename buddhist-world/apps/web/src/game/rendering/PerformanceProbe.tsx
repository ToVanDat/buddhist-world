import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { usePerformance } from "../../stores/performance";
import { summarizeFrameTimes } from "./performanceMetrics";
import { summarizeFrameTimes } from "./performanceMetrics";

/** Samples renderer.info once per second; it is a diagnostic, not a benchmark result. */
export function PerformanceProbe() {
  const gl = useThree((state) => state.gl);
  const setSnapshot = usePerformance((state) => state.setSnapshot);
  const sample = useRef({ elapsed: 0, frames: 0 });
  const frameTimes = useRef<number[]>([]);
  const frameTimes = useRef<number[]>([]);

  useFrame((_, delta) => {
    sample.current.elapsed += delta;
    frameTimes.current.push(delta * 1000);
    if (frameTimes.current.length > 120) frameTimes.current.shift();
    frameTimes.current.push(delta * 1000);
    if (frameTimes.current.length > 120) frameTimes.current.shift();
    sample.current.frames += 1;
    if (sample.current.elapsed < 1) return;

    const elapsed = sample.current.elapsed;
    const frames = sample.current.frames;
    const frameMetrics = summarizeFrameTimes(frameTimes.current);
    setSnapshot({
      fps: Math.round(frames / elapsed),
      frameMs: Math.round((elapsed / Math.max(frames, 1)) * 1000 * 10) / 10,
      frameP95Ms: Math.round(frameMetrics.p95Ms * 10) / 10,
      frameP95Ms: Math.round(frameMetrics.p95Ms * 10) / 10,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    });
    sample.current = { elapsed: 0, frames: 0 };
  });

  return null;
}
