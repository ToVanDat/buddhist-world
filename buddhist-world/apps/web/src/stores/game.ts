import { create } from "zustand";

export interface CheckpointPrompt {
  id: string;
  name: string;
  description: string;
}

interface GameState {
  nearbyCheckpoint: CheckpointPrompt | null;
  checkpointMessage: string | null;
  checkpointBusy: boolean;
  setNearbyCheckpoint: (checkpoint: CheckpointPrompt | null) => void;
  setCheckpointBusy: (busy: boolean) => void;
  setCheckpointMessage: (message: string | null) => void;
}

export const useGame = create<GameState>()((set) => ({
  nearbyCheckpoint: null,
  checkpointMessage: null,
  checkpointBusy: false,
  setNearbyCheckpoint: (nearbyCheckpoint) => set({ nearbyCheckpoint }),
  setCheckpointBusy: (checkpointBusy) => set({ checkpointBusy }),
  setCheckpointMessage: (checkpointMessage) => set({ checkpointMessage }),
}));
