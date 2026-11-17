/** Check a heartbeat against the configured ownership lease, allowing small clock skew. */
export function isHeartbeatFresh(
  heartbeatAt: unknown,
  nowMs: number,
  leaseMs: number,
  futureToleranceMs = 5_000,
): boolean {
  const timestamp = Number(heartbeatAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(nowMs) ||
      !Number.isFinite(leaseMs) || leaseMs <= 0 ||
      !Number.isFinite(futureToleranceMs) || futureToleranceMs < 0) {
    return false;
  }
  const ageMs = nowMs - timestamp;
  return ageMs >= -futureToleranceMs && ageMs <= leaseMs;
}
