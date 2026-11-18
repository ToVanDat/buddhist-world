/** Clip-local presentation events. Never use these to authorize gameplay or grant rewards. */
export type AnimationTimelineEvent = { id: string; time: number; name: string };
export type AnimationEventWindow = { previousTime: number; currentTime: number; duration: number; looped?: boolean };
/** Collect events crossed in one bounded mixer update; looped means one boundary was crossed. */
export function collectCrossedAnimationEvents(events: readonly AnimationTimelineEvent[], window: AnimationEventWindow): AnimationTimelineEvent[] {
  const { previousTime, currentTime, duration, looped = false } = window;
  if (![previousTime, currentTime, duration].every(Number.isFinite) || duration <= 0 ||
      previousTime < 0 || previousTime > duration || currentTime < 0 || currentTime > duration ||
      (looped && currentTime > previousTime)) return [];
  const valid = events.filter((event) => event.id.trim().length > 0 && event.name.trim().length > 0 &&
    Number.isFinite(event.time) && event.time >= 0 && event.time <= duration)
    .slice().sort((a, b) => a.time - b.time || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (looped) {
    // Preserve playback chronology: tail of the old loop, then head of the new loop.
    return [
      ...valid.filter((event) => event.time > previousTime),
      ...valid.filter((event) => event.time <= currentTime),
    ];
  }
  if (currentTime < previousTime) return [];
  return valid.filter((event) => event.time > previousTime && event.time <= currentTime);
}
