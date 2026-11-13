import { describe, expect, it } from "vitest";
import { INITIAL_INTRO_SEQUENCE_STATE, transitionIntroSequence } from "./introSequence";

describe("intro sequence state machine", () => {
  it("accepts the normal load, play and completion lifecycle", () => {
    const loading = transitionIntroSequence(INITIAL_INTRO_SEQUENCE_STATE, { type: "LOAD" });
    const ready = transitionIntroSequence(loading, { type: "READY" });
    const playing = transitionIntroSequence(ready, { type: "PLAY" });
    expect(transitionIntroSequence(playing, { type: "ENDED" })).toEqual({ phase: "completed" });
  });

  it("allows skip during loading, ready or playback", () => {
    const loading = transitionIntroSequence(INITIAL_INTRO_SEQUENCE_STATE, { type: "LOAD" });
    const ready = transitionIntroSequence(loading, { type: "READY" });
    const playing = transitionIntroSequence(ready, { type: "PLAY" });
    for (const state of [loading, ready, playing]) {
      expect(transitionIntroSequence(state, { type: "SKIP" })).toEqual({ phase: "skipped" });
    }
  });

  it("records media failure and permits explicit reset", () => {
    const loading = transitionIntroSequence(INITIAL_INTRO_SEQUENCE_STATE, { type: "LOAD" });
    const failed = transitionIntroSequence(loading, { type: "ERROR", message: "decode failed" });
    expect(failed).toEqual({ phase: "failed", error: "decode failed" });
    expect(transitionIntroSequence(failed, { type: "RESET" })).toEqual(INITIAL_INTRO_SEQUENCE_STATE);
  });

  it("ignores out-of-order media events", () => {
    expect(transitionIntroSequence(INITIAL_INTRO_SEQUENCE_STATE, { type: "PLAY" })).toBe(INITIAL_INTRO_SEQUENCE_STATE);
    expect(transitionIntroSequence({ phase: "completed" }, { type: "ENDED" })).toEqual({ phase: "completed" });
  });
});
