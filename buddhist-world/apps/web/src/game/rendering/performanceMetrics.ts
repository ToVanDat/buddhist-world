export interface FrameTimeSummary {
  averageMs: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  overBudgetFrames: number;
  hitchFrames: number;
}

export function percentile(values: readonly number[], fraction: number): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const p = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
}

export function summarizeFrameTimes(frameTimesMs: readonly number[]): FrameTimeSummary {
  const finite = frameTimesMs.filter((value) => Number.isFinite(value) && value >= 0);
  if (finite.length === 0) {
    return { averageMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, overBudgetFrames: 0, hitchFrames: 0 };
  }
  return {
    averageMs: finite.reduce((sum, value) => sum + value, 0) / finite.length,
    p95Ms: percentile(finite, 0.95),
    p99Ms: percentile(finite, 0.99),
    maxMs: Math.max(...finite),
    overBudgetFrames: finite.filter((value) => value > 16.667).length,
    hitchFrames: finite.filter((value) => value > 33.333).length,
  };
}

/** Fixed-capacity ring buffer avoids per-frame array shifting and unbounded growth. */
export class FrameTimeWindow {
  private readonly values: number[];
  private cursor = 0;
  private count = 0;

  constructor(private readonly capacity = 180) {
    this.values = new Array(Math.max(1, Math.floor(capacity))).fill(0);
  }

  push(value: number) {
    if (!Number.isFinite(value) || value < 0) return;
    this.values[this.cursor] = value;
    this.cursor = (this.cursor + 1) % this.values.length;
    this.count = Math.min(this.count + 1, this.values.length);
  }

  snapshot(): number[] {
    if (this.count < this.values.length) return this.values.slice(0, this.count);
    return [...this.values.slice(this.cursor), ...this.values.slice(0, this.cursor)];
  }

  clear() {
    this.cursor = 0;
    this.count = 0;
  }
}
