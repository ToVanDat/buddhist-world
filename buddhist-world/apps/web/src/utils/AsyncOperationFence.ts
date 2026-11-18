/** Invalidates asynchronous UI work when its owning view/context changes. */
export class AsyncOperationFence {
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  current(): number {
    return this.generation;
  }

  isCurrent(operation: number): boolean {
    return operation === this.generation;
  }

  invalidate(operation = this.generation): void {
    if (this.isCurrent(operation)) this.generation += 1;
  }
}
