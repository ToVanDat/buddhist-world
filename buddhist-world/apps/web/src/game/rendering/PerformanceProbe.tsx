import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { usePerformance } from "../../stores/performance";
import { FrameTimeWindow, summarizeFrameTimes } from "./performanceMetrics";

/** DEV-only rolling renderer telemetry. Values are diagnostics, not GPU benchmark claims. */
export function PerformanceProbe() {
  const gl = useThree((state) => state.gl);
  const setSnapshot = usePerformance((state) => state.setSnapshot);
  const sample = useRef({ elapsed: 0, frames: 0 });
  const frameTimes = useRef(new FrameTimeWindow(180));

  useFrame((_, delta) => {
    const frameMs = delta * 1000;
    sample.current.elapsed += delta;
    sample.current.frames += 1;
    frameTimes.current.push(frameMs);
    if (sample.current.elapsed < 1) return;

    const elapsed = sample.current.elapsed;
    const frames = sample.current.frames;
    const metrics = summarizeFrameTimes(frameTimes.current.snapshot());
    setSnapshot({
      fps: Math.round(frames / elapsed),
      frameMs: Math.round(metrics.averageMs * 10) / 10,
      frameP95Ms: Math.round(metrics.p95Ms * 10) / 10,
      frameP99Ms: Math.round(metrics.p99Ms * 10) / 10,
      maxFrameMs: Math.round(metrics.maxMs * 10) / 10,
      droppedFrames: metrics.droppedFrames,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      sampleCount: frameTimes.current.snapshot().length,
    });
    sample.current = { elapsed: 0, frames: 0 };
  });

  return null;
}
