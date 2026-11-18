import { create } from "zustand";
import { detectInitialQuality, type Quality, type QualityMode } from "../game/rendering/quality";
interface PersistedSettings { quality?: Quality; qualityMode?: QualityMode; audioVolume?: number; lookSensitivity?: number }
const STORAGE_KEY = "bw.player.settings.v1";
const isQuality = (value: unknown): value is Quality => value === "ULTRA" || value === "HIGH" || value === "MEDIUM" || value === "LOW" || value === "MOBILE";
const isQualityMode = (value: unknown): value is QualityMode => value === "auto" || value === "manual";
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
const initialQualityMode: QualityMode = isQualityMode(saved.qualityMode)
  ? saved.qualityMode
  : isQuality(saved.quality) ? "manual" : "auto";
interface SettingsState {
  quality: Quality;
  qualityMode: QualityMode;
  setQuality: (q: Quality) => void;
  setAdaptiveQuality: (q: Quality) => void;
  setQualityMode: (mode: QualityMode) => void;
  audioVolume: number; setAudioVolume: (volume: number) => void;
  lookSensitivity: number; setLookSensitivity: (v: number) => void;
}
export const useSettings = create<SettingsState>()((set, get) => ({
  quality: initialQualityMode === "manual" && isQuality(saved.quality) ? saved.quality : detectInitialQuality(),
  qualityMode: initialQualityMode,
  setQuality: (quality) => {
    set({ quality, qualityMode: "manual" });
    const state = get();
    persistSettings({ quality, qualityMode: "manual", audioVolume: state.audioVolume, lookSensitivity: state.lookSensitivity });
  },
  setAdaptiveQuality: (quality) => {
    if (get().qualityMode !== "auto") return;
    set({ quality });
    const state = get();
    persistSettings({ quality, qualityMode: "auto", audioVolume: state.audioVolume, lookSensitivity: state.lookSensitivity });
  },
  setQualityMode: (qualityMode) => {
    const quality = qualityMode === "auto" ? detectInitialQuality() : get().quality;
    set({ qualityMode, quality });
    const state = get();
    persistSettings({ quality, qualityMode, audioVolume: state.audioVolume, lookSensitivity: state.lookSensitivity });
  },
  audioVolume: typeof saved.audioVolume === "number" && Number.isFinite(saved.audioVolume) ? Math.max(0, Math.min(1, saved.audioVolume)) : .22,
  setAudioVolume: (volume) => {
    const audioVolume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : .22;
    set({ audioVolume });
    const state = get();
    persistSettings({ quality: state.quality, qualityMode: state.qualityMode, audioVolume, lookSensitivity: state.lookSensitivity });
  },
  lookSensitivity: typeof saved.lookSensitivity === "number" && Number.isFinite(saved.lookSensitivity) ? Math.max(.4, Math.min(2, saved.lookSensitivity)) : 1,
  setLookSensitivity: (value) => {
    const lookSensitivity = Number.isFinite(value) ? Math.max(.4, Math.min(2, value)) : 1;
    set({ lookSensitivity });
    const state = get();
    persistSettings({ quality: state.quality, qualityMode: state.qualityMode, audioVolume: state.audioVolume, lookSensitivity });
  },
}));
