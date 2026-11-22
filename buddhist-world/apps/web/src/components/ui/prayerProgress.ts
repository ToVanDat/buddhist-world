export const PRAYER_TARGETS = [27, 54, 108, 216] as const;
export type PrayerTarget = (typeof PRAYER_TARGETS)[number];
export interface PrayerProgress {
  version: 1;
  count: number;
  target: PrayerTarget;
  sessions: number;
  lastSessionAt: string | null;
}

export const DEFAULT_PRAYER_PROGRESS: PrayerProgress = {
  version: 1, count: 0, target: 108, sessions: 0, lastSessionAt: null,
};

export function parsePrayerProgress(raw: string | null): PrayerProgress {
  if (!raw) return { ...DEFAULT_PRAYER_PROGRESS };
  try {
    const value = JSON.parse(raw) as Partial<PrayerProgress>;
    if (value.version !== 1 || !Number.isSafeInteger(value.count) || Number(value.count) < 0 ||
        !PRAYER_TARGETS.includes(Number(value.target) as PrayerTarget) ||
        Number(value.count) > Number(value.target) ||
        !Number.isSafeInteger(value.sessions) || Number(value.sessions) < 0 ||
        !(value.lastSessionAt === null || (typeof value.lastSessionAt === "string" && Number.isFinite(Date.parse(value.lastSessionAt))))) {
      return { ...DEFAULT_PRAYER_PROGRESS };
    }
    return {
      version: 1,
      count: Number(value.count),
      target: Number(value.target) as PrayerTarget,
      sessions: Number(value.sessions),
      lastSessionAt: value.lastSessionAt ?? null,
    };
  } catch {
    return { ...DEFAULT_PRAYER_PROGRESS };
  }
}

export function incrementPrayerProgress(progress: PrayerProgress, completedAt: string): PrayerProgress {
  if (progress.count >= progress.target) return progress;
  const count = progress.count + 1;
  return count === progress.target
    ? { ...progress, count, sessions: progress.sessions + 1, lastSessionAt: completedAt }
    : { ...progress, count };
}

export function selectPrayerTarget(progress: PrayerProgress, target: PrayerTarget): PrayerProgress {
  if (progress.target === target) return progress;
  return { ...progress, target, count: 0 };
}

export function resetPrayerProgress(progress: PrayerProgress): PrayerProgress {
  return { ...progress, count: 0 };
}

export function prayerProgressStorageKey(userId: string): string {
  return `bw.prayer.progress.v1:${encodeURIComponent(userId.trim() || "anonymous")}`;
}
