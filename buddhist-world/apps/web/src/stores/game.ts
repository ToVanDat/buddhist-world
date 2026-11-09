import { create } from "zustand";
import type { Vec3, WorldInteractionDef } from "@bw/shared";

export interface CheckpointPrompt {
  id: string;
  name: string;
  description: string;
}

interface GameState {
  nearbyCheckpoint: CheckpointPrompt | null;
  checkpointMessage: string | null;
  checkpointBusy: boolean;
  playerPosition: Vec3 | null;
  waypointId: string | null;
  nearbyInteraction: WorldInteractionDef | null;
  interactionMessage: string | null;
  setNearbyCheckpoint: (checkpoint: CheckpointPrompt | null) => void;
  setCheckpointBusy: (busy: boolean) => void;
  setCheckpointMessage: (message: string | null) => void;
  setPlayerPosition: (position: Vec3 | null) => void;
  setWaypoint: (waypointId: string | null) => void;
  setNearbyInteraction: (interaction: WorldInteractionDef | null) => void;
  setInteractionMessage: (message: string | null) => void;
}

export const useGame = create<GameState>()((set) => ({
  nearbyCheckpoint: null,
  checkpointMessage: null,
  checkpointBusy: false,
  playerPosition: null,
  waypointId: null,
  nearbyInteraction: null,
  interactionMessage: null,
  setNearbyCheckpoint: (nearbyCheckpoint) => set({ nearbyCheckpoint }),
  setCheckpointBusy: (checkpointBusy) => set({ checkpointBusy }),
  setCheckpointMessage: (checkpointMessage) => set({ checkpointMessage }),
  setPlayerPosition: (playerPosition) => set({ playerPosition }),
  setWaypoint: (waypointId) => set({ waypointId }),
  setNearbyInteraction: (nearbyInteraction) => set({ nearbyInteraction }),
  setInteractionMessage: (interactionMessage) => set({ interactionMessage }),
}));
