import type { Vec3 } from "@bw/shared";

type WorldCue = "bell" | "incense" | "buddha" | "altar" | "npc";
export interface WorldAudioSpatial {
  source: Vec3;
  listener: Vec3;
}

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  audioContext ??= new AudioContext();
  return audioContext;
}

/** Call directly from a user gesture so browsers allow later server-confirmed cues. */
export function unlockWorldAudio(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") void context.resume().catch(() => {});
}

function makeSpatialOutput(context: AudioContext, spatial?: WorldAudioSpatial): AudioNode {
  if (!spatial) return context.destination;
  const listener = context.listener;
  listener.positionX.setValueAtTime(spatial.listener[0], context.currentTime);
  listener.positionY.setValueAtTime(spatial.listener[1], context.currentTime);
  listener.positionZ.setValueAtTime(spatial.listener[2], context.currentTime);
  const panner = context.createPanner();
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 2.5;
  panner.maxDistance = 55;
  panner.rolloffFactor = 1.35;
  panner.positionX.setValueAtTime(spatial.source[0], context.currentTime);
  panner.positionY.setValueAtTime(spatial.source[1], context.currentTime);
  panner.positionZ.setValueAtTime(spatial.source[2], context.currentTime);
  panner.connect(context.destination);
  return panner;
}

/** Designed synthesized cues. Bell partials are an interim approximation, not a field recording. */
export function playWorldCue(kind: string, spatial?: WorldAudioSpatial): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  if (kind === "bell") {
    const output = makeSpatialOutput(context, spatial);
    // Inharmonic partials and different decay times approximate a cast bronze bell.
    const partials = [
      { ratio: 1.0, gain: 0.052, decay: 7.8 },
      { ratio: 2.01, gain: 0.026, decay: 6.2 },
      { ratio: 2.74, gain: 0.016, decay: 5.3 },
      { ratio: 3.98, gain: 0.010, decay: 4.4 },
      { ratio: 5.42, gain: 0.006, decay: 3.6 },
      { ratio: 6.83, gain: 0.0035, decay: 2.9 },
    ];
    for (const partial of partials) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(108 * partial.ratio, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(partial.gain, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay);
      oscillator.connect(gain);
      gain.connect(output);
      oscillator.start(now);
      oscillator.stop(now + partial.decay + 0.04);
    }
    return;
  }

  const tones: Record<Exclude<WorldCue, "bell">, { frequencies: number[]; duration: number; volume: number }> = {
    incense: { frequencies: [659.25, 987.77], duration: 0.75, volume: 0.018 },
    buddha: { frequencies: [392, 587.33], duration: 1.1, volume: 0.014 },
    altar: { frequencies: [440, 659.25], duration: 0.8, volume: 0.016 },
    npc: { frequencies: [587.33, 783.99], duration: 0.32, volume: 0.012 },
  };
  const cue = tones[kind as Exclude<WorldCue, "bell">];
  if (!cue) return;
  cue.frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(cue.volume / (index + 1), now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + cue.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + cue.duration + 0.03);
  });
}
