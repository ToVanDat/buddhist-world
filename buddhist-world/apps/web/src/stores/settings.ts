import { create } from "zustand";
import { detectInitialQuality, type Quality } from "../game/rendering/quality";
interface PersistedSettings { quality?: Quality; audioVolume?: number; lookSensitivity?: number }
const STORAGE_KEY = "bw.player.settings.v1";
const isQuality = (value: unknown): value is Quality => value === "ULTRA" || value === "HIGH" || value === "MEDIUM" || value === "LOW" || value === "MOBILE";
function readSettings(): PersistedSettings {
  if (typeof window === "undefined") return {};
  try { const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as PersistedSettings; return value && typeof value === "object" ? value : {}; }
  catch { return {}; }
}
function persistSettings(value: PersistedSettings) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
}
const saved = readSettings();
interface SettingsState {
  quality: Quality; setQuality: (q: Quality) => void;
  audioVolume: number; setAudioVolume: (volume: number) => void;
  lookSensitivity: number; setLookSensitivity: (v: number) => void;
}
export const useSettings = create<SettingsState>()((set, get) => ({
  quality: isQuality(saved.quality) ? saved.quality : detectInitialQuality(),
  setQuality: (quality) => { set({ quality }); persistSettings({ quality, audioVolume: get().audioVolume, lookSensitivity: get().lookSensitivity }); },
  audioVolume: typeof saved.audioVolume === "number" && Number.isFinite(saved.audioVolume) ? Math.max(0, Math.min(1, saved.audioVolume)) : .22,
  setAudioVolume: (volume) => { const audioVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : .22; set({ audioVolume }); persistSettings({ quality: get().quality, audioVolume, lookSensitivity: get().lookSensitivity }); },
  lookSensitivity: typeof saved.lookSensitivity === "number" && Number.isFinite(saved.lookSensitivity) ? Math.max(.4, Math.min(2, saved.lookSensitivity)) : 1,
  setLookSensitivity: (value) => { const lookSensitivity = Number.isFinite(value) ? Math.max(.4, Math.min(2, value)) : 1; set({ lookSensitivity }); persistSettings({ quality: get().quality, audioVolume: get().audioVolume, lookSensitivity }); },
}));
