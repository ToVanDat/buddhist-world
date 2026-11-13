import { describe, expect, it, vi } from "vitest";
import { WorldAudioSession, type AudioElementPort } from "./WorldAudioSession";

function createAudio() {
  const audio: AudioElementPort = {
    loop: false,
    volume: 1,
    currentTime: 4,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
  };
  return audio;
}

describe("world ambience lifecycle", () => {
  it("waits for an explicit user gesture before playback", async () => {
    const audio = createAudio();
    const session = new WorldAudioSession(audio, 0.3);
    expect(session.getState()).toBe("locked");
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.loop).toBe(true);
    expect(audio.volume).toBe(0.3);
    await session.activate();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe("playing");
  });

  it("does not issue repeated play requests while already playing", async () => {
    const audio = createAudio();
    const session = new WorldAudioSession(audio);
    await session.activate();
    await session.activate();
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it("pauses while the document is hidden and resumes when visible", async () => {
    const audio = createAudio();
    const session = new WorldAudioSession(audio);
    await session.activate();
    await session.setVisible(false);
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe("paused");
    await session.setVisible(true);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(session.getState()).toBe("playing");
  });

  it("clamps volume and ignores invalid volume updates", () => {
    const audio = createAudio();
    const session = new WorldAudioSession(audio);
    session.setVolume(2);
    expect(audio.volume).toBe(1);
    session.setVolume(Number.NaN);
    expect(audio.volume).toBe(1);
  });

  it("disposes idempotently and resets playback position", () => {
    const audio = createAudio();
    const session = new WorldAudioSession(audio);
    session.dispose();
    session.dispose();
    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(audio.currentTime).toBe(0);
    expect(session.getState()).toBe("disposed");
  });

  it("does not restart after disposal", async () => {
    const audio = createAudio();
    const session = new WorldAudioSession(audio);
    session.dispose();
    await session.activate();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it("does not let an older play promise pause a newer visibility-resume request", async () => {
    const audio = createAudio();
    const resolvers: Array<() => void> = [];
    let playCalls = 0;
    audio.play = () => {
      playCalls += 1;
      return new Promise<void>((resolve) => resolvers.push(resolve));
    };
    const session = new WorldAudioSession(audio);
    const firstPlay = session.activate();
    await Promise.resolve();
    await session.setVisible(false);
    const resumedPlay = session.setVisible(true);
    await Promise.resolve();
    expect(playCalls).toBe(2);
    resolvers[0]?.();
    await firstPlay;
    expect(audio.pause).toHaveBeenCalledTimes(1);
    resolvers[1]?.();
    await resumedPlay;
    expect(session.getState()).toBe("playing");
    expect(audio.pause).toHaveBeenCalledTimes(1);
  });
});
