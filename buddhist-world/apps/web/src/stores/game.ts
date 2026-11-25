import { create } from "zustand";
import type { NpcRegionSnapshot, NpcWorldSnapshot, Vec3, WorldInteractionDef } from "@bw/shared";
import type { CameraMode } from "../game/rendering/cameraModes";

export interface NpcQuestOffer { id: string; title: string; description: string; rewards: { itemId: string; quantity: number }[] }
export interface NpcDialogueLine { id: string; text: string }
export interface NpcDialogueChoice { id: string; label: string }
export interface NpcDialogueState { name: string; response: string; npcId?: string; nodeId?: string; choices?: NpcDialogueChoice[]; dialogue?: NpcDialogueLine[]; completionNotice?: string; questOffers?: NpcQuestOffer[] }

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
  nearbyRitualSpot: boolean;
  playerAction: "meditate" | "prostrate" | "incense" | "ringBell" | null;
  playerActionStartedAt: number | null;
  interactionMessage: string | null;
  npcDialogue: NpcDialogueState | null;
  npcStates: Record<string, NpcWorldSnapshot>;
  lastWorldInteraction: { targetId: string; at: number } | null;
  questRevision: number;
  cameraMode: CameraMode;
  setNearbyCheckpoint: (checkpoint: CheckpointPrompt | null) => void;
  setCheckpointBusy: (busy: boolean) => void;
  setCheckpointMessage: (message: string | null) => void;
  setPlayerPosition: (position: Vec3 | null) => void;
  setPlayerYaw: (yaw: number) => void;
  setWaypoint: (waypointId: string | null) => void;
  setNearbyInteraction: (interaction: WorldInteractionDef | null) => void;
  setNearbyRitualSpot: (nearby: boolean) => void;
  startPlayerAction: (action: "meditate" | "prostrate" | "incense" | "ringBell") => void;
  finishPlayerAction: () => void;
  setInteractionMessage: (message: string | null) => void;
  setNpcDialogue: (dialogue: NpcDialogueState | null) => void;
  setNpcRegionSnapshot: (snapshot: NpcRegionSnapshot) => void;
  setLastWorldInteraction: (interaction: { targetId: string; at: number } | null) => void;
  refreshQuestTracker: () => void;
  setCameraMode: (mode: CameraMode) => void;
}

export const useGame = create<GameState>()((set) => ({
  nearbyCheckpoint: null,
  checkpointMessage: null,
  checkpointBusy: false,
  playerPosition: null,
  playerYaw: 0,
  waypointId: null,
  nearbyInteraction: null,
  nearbyRitualSpot: false,
  playerAction: null,
  playerActionStartedAt: null,
  interactionMessage: null,
  npcDialogue: null,
  npcStates: {},
  lastWorldInteraction: null,
  questRevision: 0,
  cameraMode: (() => { try { const saved = window.localStorage.getItem("bw.player.camera-mode.v1"); return saved === "cinematic" || saved === "photo" ? saved : "gameplay"; } catch { return "gameplay"; } })(),
  setNearbyCheckpoint: (nearbyCheckpoint) => set({ nearbyCheckpoint }),
  setCheckpointBusy: (checkpointBusy) => set({ checkpointBusy }),
  setCheckpointMessage: (checkpointMessage) => set({ checkpointMessage }),
  setPlayerPosition: (playerPosition) => set({ playerPosition }),
  setPlayerYaw: (playerYaw) => set({ playerYaw }),
  setWaypoint: (waypointId) => set({ waypointId }),
  setNearbyInteraction: (nearbyInteraction) => set({ nearbyInteraction }),
  setNearbyRitualSpot: (nearbyRitualSpot) => set({ nearbyRitualSpot }),
  startPlayerAction: (playerAction) => set({ playerAction, playerActionStartedAt: Date.now() }),
  finishPlayerAction: () => set({ playerAction: null, playerActionStartedAt: null }),
  setInteractionMessage: (interactionMessage) => set({ interactionMessage }),
  setNpcDialogue: (npcDialogue) => set({ npcDialogue }),
  setNpcRegionSnapshot: (snapshot) => set((state) => ({
    npcStates: snapshot.regionId === "__reset__" ? {} : { ...state.npcStates, ...Object.fromEntries(snapshot.npcs.map((npc) => [npc.id, npc])) },
  })),
  setLastWorldInteraction: (lastWorldInteraction) => set({ lastWorldInteraction }),
  refreshQuestTracker: () => set((state) => ({ questRevision: state.questRevision + 1 })),
  setCameraMode: (cameraMode) => { set({ cameraMode }); try { window.localStorage.setItem("bw.player.camera-mode.v1", cameraMode); } catch { /* Storage may be unavailable. */ } },
}));
