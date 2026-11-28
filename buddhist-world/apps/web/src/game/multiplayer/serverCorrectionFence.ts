export interface ServerCorrectionPayload {
  regionId: string;
  position: [number, number, number];
  seq: number;
}

/**
 * Accept only corrections for the active region and a movement update that this
 * client has already sent. Delayed packets must not rewind a newer player state.
 */
export function shouldAcceptServerCorrection(
  payload: unknown,
  activeRegionId: string | null,
  latestSentSeq: number,
): payload is ServerCorrectionPayload {
  if (activeRegionId === null || !Number.isSafeInteger(latestSentSeq) || latestSentSeq < 0 ||
      payload === null || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return value.regionId === activeRegionId &&
    Number.isSafeInteger(value.seq) &&
    (value.seq as number) >= 0 &&
    (value.seq as number) <= latestSentSeq &&
    Array.isArray(value.position) &&
    value.position.length === 3 &&
    value.position.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}
