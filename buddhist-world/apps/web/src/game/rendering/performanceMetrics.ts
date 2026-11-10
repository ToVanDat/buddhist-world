export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const p = Math.min(1, Math.max(0, fraction));
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

export function summarizeFrameTimes(frameTimesMs: readonly number[]) {
  if (frameTimesMs.length === 0) return { averageMs: 0, p95Ms: 0 };
  const finite = frameTimesMs.filter(Number.isFinite);
  if (finite.length === 0) return { averageMs: 0, p95Ms: 0 };
  return {
    averageMs: finite.reduce((sum, value) => sum + value, 0) / finite.length,
    p95Ms: percentile(finite, 0.95),
  };
}
