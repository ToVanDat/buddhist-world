import { create } from "zustand";
import { detectInitialQuality, type Quality } from "../game/rendering/quality";

interface SettingsState {
  quality: Quality;
  setQuality: (q: Quality) => void;
  lookSensitivity: number;
  setLookSensitivity: (v: number) => void;
}
export const useSettings = create<SettingsState>()((set) => ({
  quality: detectInitialQuality(),
  setQuality: (quality) => set({ quality }),
  lookSensitivity: 1,
  setLookSensitivity: (lookSensitivity) => set({ lookSensitivity }),
}));
