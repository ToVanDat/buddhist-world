/**
 * Prevents overlapping user mutations that share one UI refresh/fencing lifecycle.
 * The server remains authoritative; this only serializes client-side actions.
 */
export class AsyncMutationGate {
  private acquired = false;

  tryAcquire(): boolean {
    if (this.acquired) return false;
    this.acquired = true;
    return true;
  }

  release(): void {
    this.acquired = false;
  }
}
