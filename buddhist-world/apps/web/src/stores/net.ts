import { create } from "zustand";
import type { ChatMessage, Vec3 } from "@bw/shared";

export type NetStatus = "idle" | "connecting" | "in-region" | "reconnecting" | "error";
interface NetState {
  status: NetStatus;
  regionId: string | null;
  spawn: { position: Vec3; yaw: number } | null;
  remoteIds: string[];            // chỉ thay đổi khi có người vào/ra → không re-render theo từng frame
  chat: ChatMessage[];
  notice: string | null;
  patch: (p: Partial<Omit<NetState, "patch" | "pushChat">>) => void;
  pushChat: (m: ChatMessage) => void;
}
export const useNet = create<NetState>()((set) => ({
  status: "idle", regionId: null, spawn: null, remoteIds: [], chat: [], notice: null,
  patch: (p) => set(p),
  pushChat: (m) => set((s) => ({ chat: [...s.chat.slice(-49), m] })),
}));
