type WorldCue = "bell" | "incense" | "buddha" | "altar" | "npc";

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

/** Lightweight synthesized fallback cues; replace with recorded spatial audio in the final audio pass. */
export function playWorldCue(kind: string): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  const tones: Record<WorldCue, { frequencies: number[]; duration: number; volume: number }> = {
    bell: { frequencies: [523.25, 783.99, 1046.5], duration: 2.4, volume: 0.045 },
    incense: { frequencies: [659.25, 987.77], duration: 0.75, volume: 0.018 },
    buddha: { frequencies: [392, 587.33], duration: 1.1, volume: 0.014 },
    altar: { frequencies: [440, 659.25], duration: 0.8, volume: 0.016 },
    npc: { frequencies: [587.33, 783.99], duration: 0.32, volume: 0.012 },
  };
  const cue = tones[kind as WorldCue];
  if (!cue) return;
  cue.frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = kind === "bell" ? "sine" : "triangle";
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
