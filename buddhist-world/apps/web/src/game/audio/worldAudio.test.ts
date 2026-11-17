import { beforeEach, describe, expect, it, vi } from "vitest";

function createAudioContextMock() {
  const destination = {};
  const position = () => ({ setValueAtTime: vi.fn() });
  const panner = {
    panningModel: "",
    distanceModel: "",
    refDistance: 0,
    maxDistance: 0,
    rolloffFactor: 0,
    positionX: position(),
    positionY: position(),
    positionZ: position(),
    connect: vi.fn(),
  };
  const oscillator = {
    type: "",
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  };
  const context = {
    state: "running",
    currentTime: 0,
    destination,
    listener: { positionX: position(), positionY: position(), positionZ: position() },
    createPanner: vi.fn(() => panner),
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
  };
  return { context, destination, panner, oscillator, gain };
}

describe("world interaction audio spatialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("routes non-bell interaction cues through a 3D panner when positions are known", async () => {
    const mock = createAudioContextMock();
    vi.stubGlobal("window", {});
    vi.stubGlobal("AudioContext", class {
      state = mock.context.state;
      currentTime = mock.context.currentTime;
      destination = mock.context.destination;
      listener = mock.context.listener as unknown as AudioListener;
      createPanner = mock.context.createPanner;
      createOscillator = mock.context.createOscillator;
      createGain = mock.context.createGain;
    });
    const { playWorldCue } = await import("./worldAudio");

    playWorldCue("incense", { source: [8, 1, -3], listener: [2, 0, 4] });

    expect(mock.context.createPanner).toHaveBeenCalledTimes(1);
    expect(mock.panner.positionX.setValueAtTime).toHaveBeenCalledWith(8, 0);
    expect(mock.panner.positionY.setValueAtTime).toHaveBeenCalledWith(1, 0);
    expect(mock.panner.positionZ.setValueAtTime).toHaveBeenCalledWith(-3, 0);
    expect(mock.context.listener.positionX.setValueAtTime).toHaveBeenCalledWith(2, 0);
    expect(mock.gain.connect).toHaveBeenCalledWith(mock.panner);
    expect(mock.panner.connect).toHaveBeenCalledWith(mock.destination);
  });

  it("keeps cues non-spatial when a world position is unavailable", async () => {
    const mock = createAudioContextMock();
    vi.stubGlobal("window", {});
    vi.stubGlobal("AudioContext", class { constructor() { return mock.context as unknown as AudioContext; } });
    const { playWorldCue } = await import("./worldAudio");

    playWorldCue("npc");

    expect(mock.context.createPanner).not.toHaveBeenCalled();
    expect(mock.gain.connect).toHaveBeenCalledWith(mock.destination);
  });
});
