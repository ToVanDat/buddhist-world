import { create } from "zustand";

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  frameP95Ms: number;
  frameP99Ms: number;
  maxFrameMs: number;
  droppedFrames: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  sampleCount: number;
}

interface PerformanceState {
  visible: boolean;
  snapshot: PerformanceSnapshot;
  toggle: () => void;
  setSnapshot: (snapshot: PerformanceSnapshot) => void;
}

const EMPTY_SNAPSHOT: PerformanceSnapshot = {
  fps: 0, frameMs: 0, frameP95Ms: 0, frameP99Ms: 0, maxFrameMs: 0,
  droppedFrames: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0,
  programs: 0, sampleCount: 0,
};

export const usePerformance = create<PerformanceState>()((set) => ({
  visible: false,
  snapshot: EMPTY_SNAPSHOT,
  toggle: () => set((state) => ({ visible: !state.visible })),
  setSnapshot: (snapshot) => set({ snapshot }),
}));
