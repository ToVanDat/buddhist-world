export interface PendingInteractionRequest {
  requestId: string;
  targetId: string;
}

/**
 * Correlates asynchronous interaction results with the latest player action.
 * A stale response never consumes a newer pending request.
 */
export class InteractionResponseFence {
  private pending: PendingInteractionRequest | null = null;

  begin(requestId: string, targetId: string): void {
    this.pending = { requestId, targetId };
  }

  consume(requestId: string | undefined, targetId: string): boolean {
    if (!requestId || !this.pending ||
        this.pending.requestId !== requestId ||
        this.pending.targetId !== targetId) return false;
    this.pending = null;
    return true;
  }

  clear(): void {
    this.pending = null;
  }
}
