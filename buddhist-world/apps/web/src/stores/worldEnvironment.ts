import { create } from "zustand";
import type { WorldEnvironmentSnapshot } from "@bw/shared";

interface WorldEnvironmentState {
  snapshot: WorldEnvironmentSnapshot | null;
  receivedAt: number | null;
  setSnapshot: (snapshot: WorldEnvironmentSnapshot) => void;
  reset: () => void;
}

export const useWorldEnvironment = create<WorldEnvironmentState>()((set) => ({
  snapshot: null,
  receivedAt: null,
  setSnapshot: (snapshot) => set({ snapshot, receivedAt: Date.now() }),
  reset: () => set({ snapshot: null, receivedAt: null }),
}));
