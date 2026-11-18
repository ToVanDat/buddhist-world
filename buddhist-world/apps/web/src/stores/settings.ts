import { create } from "zustand";
import { detectInitialQuality, type Quality } from "../game/rendering/quality";

interface SettingsState {
  quality: Quality;
  setQuality: (q: Quality) => void;
  audioVolume: number;
  setAudioVolume: (volume: number) => void;
  lookSensitivity: number;
  setLookSensitivity: (v: number) => void;
}
export const useSettings = create<SettingsState>()((set) => ({
  quality: detectInitialQuality(),
  setQuality: (quality) => set({ quality }),
  audioVolume: 0.22,
  setAudioVolume: (volume) => set({ audioVolume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.22 }),
  lookSensitivity: 1,
  setLookSensitivity: (lookSensitivity) => set({ lookSensitivity }),
}));
