import { create } from "zustand";
import type { Vec3, WorldInteractionDef } from "@bw/shared";

export interface NpcQuestOffer { id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }
export interface NpcDialogueLine { id: string; text: string }
export interface NpcDialogueState { name: string; response: string; dialogue?: NpcDialogueLine[]; questOffers?: NpcQuestOffer[] }

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
  playerYaw: number;
  waypointId: string | null;
  nearbyInteraction: WorldInteractionDef | null;
  interactionMessage: string | null;
  npcDialogue: NpcDialogueState | null;
  lastWorldInteraction: { targetId: string; at: number } | null;
  setNearbyCheckpoint: (checkpoint: CheckpointPrompt | null) => void;
  setCheckpointBusy: (busy: boolean) => void;
  setCheckpointMessage: (message: string | null) => void;
  setPlayerPosition: (position: Vec3 | null) => void;
  setPlayerYaw: (yaw: number) => void;
  setWaypoint: (waypointId: string | null) => void;
  setNearbyInteraction: (interaction: WorldInteractionDef | null) => void;
  setInteractionMessage: (message: string | null) => void;
  setNpcDialogue: (dialogue: NpcDialogueState | null) => void;
  setLastWorldInteraction: (interaction: { targetId: string; at: number } | null) => void;
}

export const useGame = create<GameState>()((set) => ({
  nearbyCheckpoint: null,
  checkpointMessage: null,
  checkpointBusy: false,
  playerPosition: null,
  playerYaw: 0,
  waypointId: null,
  nearbyInteraction: null,
  interactionMessage: null,
  npcDialogue: null,
  lastWorldInteraction: null,
  setNearbyCheckpoint: (nearbyCheckpoint) => set({ nearbyCheckpoint }),
  setCheckpointBusy: (checkpointBusy) => set({ checkpointBusy }),
  setCheckpointMessage: (checkpointMessage) => set({ checkpointMessage }),
  setPlayerPosition: (playerPosition) => set({ playerPosition }),
  setPlayerYaw: (playerYaw) => set({ playerYaw }),
  setWaypoint: (waypointId) => set({ waypointId }),
  setNearbyInteraction: (nearbyInteraction) => set({ nearbyInteraction }),
  setInteractionMessage: (interactionMessage) => set({ interactionMessage }),
  setNpcDialogue: (npcDialogue) => set({ npcDialogue }),
  setLastWorldInteraction: (lastWorldInteraction) => set({ lastWorldInteraction }),
}));
