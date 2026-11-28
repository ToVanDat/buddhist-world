export interface ServerCorrectionPayload {
  regionId: string;
  position: [number, number, number];
  seq: number;
}

/**
 * Accept delayed corrections for sent updates in the active region, but only
 * in increasing sequence order so stale packets cannot rewind newer corrections.
 */
export function shouldAcceptServerCorrection(
  payload: unknown,
  activeRegionId: string | null,
  latestSentSeq: number,
  lastAppliedSeq = -1,
): payload is ServerCorrectionPayload {
  if (activeRegionId === null || !Number.isSafeInteger(latestSentSeq) || latestSentSeq < 0 ||
      !Number.isSafeInteger(lastAppliedSeq) || payload === null || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return value.regionId === activeRegionId &&
    Number.isSafeInteger(value.seq) &&
    (value.seq as number) >= 0 &&
    (value.seq as number) <= latestSentSeq &&
    (value.seq as number) > lastAppliedSeq &&
    Array.isArray(value.position) &&
    value.position.length === 3 &&
    value.position.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}
