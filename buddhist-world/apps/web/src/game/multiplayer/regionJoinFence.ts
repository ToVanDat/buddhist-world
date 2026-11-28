/** Accept only the region the client most recently requested to join. */
export function shouldAcceptServerJoined(
  joinedRegionId: unknown,
  wantedRegionId: string | null,
): joinedRegionId is string {
  return typeof joinedRegionId === "string" &&
    wantedRegionId !== null &&
    joinedRegionId === wantedRegionId;
}
