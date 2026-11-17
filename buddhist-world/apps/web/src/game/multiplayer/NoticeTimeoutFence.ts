export class NoticeTimeoutFence {
  private readonly revisions = new Map<string, number>();

  begin(channel: string): number {
    const revision = (this.revisions.get(channel) ?? 0) + 1;
    this.revisions.set(channel, revision);
    return revision;
  }

  invalidate(channel: string): void {
    this.begin(channel);
  }

  isCurrent(channel: string, revision: number): boolean {
    return this.revisions.get(channel) === revision;
  }
}
