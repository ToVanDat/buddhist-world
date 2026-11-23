import { describe, expect, it, vi } from "vitest";
import { createAudioNodeRelease } from "./audioNodeLifecycle";

describe("spatial audio node lifecycle", () => {
  it("disconnects the panner only after every source has ended", () => {
    const disconnect = vi.fn();
    const release = createAudioNodeRelease({ disconnect }, 3);
    release();
    release();
    expect(disconnect).not.toHaveBeenCalled();
    release();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not disconnect more than once when completion events repeat", () => {
    const disconnect = vi.fn();
    const release = createAudioNodeRelease({ disconnect }, 1);
    release();
    release();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("releases an output immediately when no sources were scheduled", () => {
    const disconnect = vi.fn();
    createAudioNodeRelease({ disconnect }, 0)();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
