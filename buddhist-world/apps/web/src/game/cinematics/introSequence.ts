export type IntroPhase = "idle" | "loading" | "ready" | "playing" | "completed" | "skipped" | "failed";

export interface IntroSequenceState {
  phase: IntroPhase;
  error?: string;
}

export type IntroSequenceEvent =
  | { type: "LOAD" }
  | { type: "READY" }
  | { type: "PLAY" }
  | { type: "ENDED" }
  | { type: "SKIP" }
  | { type: "ERROR"; message?: string }
  | { type: "RESET" };

export const INITIAL_INTRO_SEQUENCE_STATE: IntroSequenceState = { phase: "idle" };

/** Pure, asset-independent intro state machine; media playback remains owned by the UI adapter. */
export function transitionIntroSequence(
  state: IntroSequenceState,
  event: IntroSequenceEvent,
): IntroSequenceState {
  if (event.type === "RESET") return INITIAL_INTRO_SEQUENCE_STATE;
  if (event.type === "SKIP" && ["loading", "ready", "playing"].includes(state.phase)) {
    return { phase: "skipped" };
  }
  switch (event.type) {
    case "LOAD":
      return state.phase === "idle" ? { phase: "loading" } : state;
    case "READY":
      return state.phase === "loading" ? { phase: "ready" } : state;
    case "PLAY":
      return state.phase === "ready" ? { phase: "playing" } : state;
    case "ENDED":
      return state.phase === "playing" ? { phase: "completed" } : state;
    case "ERROR":
      return ["loading", "ready", "playing"].includes(state.phase)
        ? { phase: "failed", error: event.message ?? "Intro media failed" }
        : state;
    case "SKIP":
      return state;
  }
}
