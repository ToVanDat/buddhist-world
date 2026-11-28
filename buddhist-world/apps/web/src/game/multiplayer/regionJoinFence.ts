import { getRegion } from "@bw/shared";

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
  const region = getRegion(wantedRegionId);
  return !!region &&
    typeof value.regionId === "string" &&
    value.regionId === wantedRegionId &&
    Array.isArray(value.position) &&
    value.position.length === 3 &&
    value.position.every((coordinate, index) => typeof coordinate === "number" &&
      Number.isFinite(coordinate) &&
      coordinate >= region.bounds.min[index]! && coordinate <= region.bounds.max[index]!) &&
    typeof value.yaw === "number" &&
    Number.isFinite(value.yaw) &&
    Math.abs(value.yaw) <= Math.PI * 4;
}
