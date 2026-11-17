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

  isCurrent(requestId: string | undefined, targetId: string): boolean {
    return !!requestId && !!this.pending &&
      this.pending.requestId === requestId &&
      this.pending.targetId === targetId;
  }

  consume(requestId: string | undefined, targetId: string): boolean {
    if (!this.isCurrent(requestId, targetId)) return false;
    this.pending = null;
    return true;
  }

  clear(): void {
    this.pending = null;
  }
}
