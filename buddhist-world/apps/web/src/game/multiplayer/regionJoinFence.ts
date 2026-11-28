export interface ServerJoinedPayload {
  regionId: string;
  position: [number, number, number];
  yaw: number;
}

/** Validate the acknowledgement and fence it to the region requested by this client. */
export function shouldAcceptServerJoined(
  payload: unknown,
  wantedRegionId: string | null,
): payload is ServerJoinedPayload {
  if (wantedRegionId === null || payload === null || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return typeof value.regionId === "string" &&
    value.regionId === wantedRegionId &&
    Array.isArray(value.position) &&
    value.position.length === 3 &&
    value.position.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    typeof value.yaw === "number" &&
    Number.isFinite(value.yaw);
}
