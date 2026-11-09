import { create } from "zustand";

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

interface PerformanceState {
  visible: boolean;
  snapshot: PerformanceSnapshot;
  toggle: () => void;
  setSnapshot: (snapshot: PerformanceSnapshot) => void;
}

export const usePerformance = create<PerformanceState>()((set) => ({
  visible: false,
  snapshot: { fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 },
  toggle: () => set((state) => ({ visible: !state.visible })),
  setSnapshot: (snapshot) => set({ snapshot }),
}));
