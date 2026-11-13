export type WorldAudioState = "locked" | "playing" | "paused" | "failed" | "disposed";

export interface AudioElementPort {
  loop: boolean;
  volume: number;
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
}

/** Owns one non-spatial ambience track and its browser visibility/user-gesture lifecycle. */
export class WorldAudioSession {
  private state: WorldAudioState = "locked";
  private unlocked = false;
  private visible = true;
  private disposed = false;

  constructor(private readonly audio: AudioElementPort, volume = 0.22) {
    this.audio.loop = true;
    this.audio.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0.22));
  }

  getState(): WorldAudioState {
    return this.state;
  }

  async activate(): Promise<void> {
    if (this.disposed || !this.visible) return;
    this.unlocked = true;
    await this.playIfAllowed();
  }

  async setVisible(visible: boolean): Promise<void> {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible;
    if (!visible) {
      this.audio.pause();
      if (this.unlocked) this.state = "paused";
      return;
    }
    if (this.unlocked) await this.playIfAllowed();
  }

  setVolume(volume: number): void {
    if (this.disposed || !Number.isFinite(volume)) return;
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.state = "disposed";
  }

  private async playIfAllowed(): Promise<void> {
    try {
      await this.audio.play();
      if (!this.disposed && this.visible) this.state = "playing";
    } catch {
      if (!this.disposed) this.state = "failed";
    }
  }
}
