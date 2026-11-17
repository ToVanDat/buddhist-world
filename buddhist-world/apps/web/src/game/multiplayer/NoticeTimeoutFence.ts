export class NoticeTimeoutFence {
  private readonly revisions = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  begin(channel: string): number {
    const timer = this.timers.get(channel);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(channel);
    const revision = (this.revisions.get(channel) ?? 0) + 1;
    this.revisions.set(channel, revision);
    return revision;
  }

  schedule(channel: string, delayMs: number, callback: () => void): number {
    const revision = this.begin(channel);
    const timer = setTimeout(() => {
      if (!this.isCurrent(channel, revision)) return;
      this.timers.delete(channel);
      callback();
    }, Math.max(0, delayMs));
    this.timers.set(channel, timer);
    return revision;
  }

  invalidate(channel: string): void { this.begin(channel); }

  invalidateAll(): void {
    for (const channel of new Set([...this.revisions.keys(), ...this.timers.keys()])) this.invalidate(channel);
  }

  isCurrent(channel: string, revision: number): boolean {
    return this.revisions.get(channel) === revision;
  }
}
