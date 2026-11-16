export type FriendRequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "removed";

const RESENDABLE_STATUSES = new Set<FriendRequestStatus>(["declined", "cancelled", "removed"]);

/** The same two accounts must serialize relationship writes in either direction. */
export function relationshipLockKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(":");
}

export function isResendableRequestStatus(status: FriendRequestStatus): boolean {
  return RESENDABLE_STATUSES.has(status);
}

export function isDistinctUserPair(firstUserId: string, secondUserId: string): boolean {
  return firstUserId.length > 0 && secondUserId.length > 0 && firstUserId !== secondUserId;
}
