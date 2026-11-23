export type CommunityVisibility = "public" | "private";

/**
 * Private community details are visible only to current active members.
 * Former members must not retain access after leaving the community.
 */
export function canViewCommunityDetails(
  visibility: CommunityVisibility,
  membershipStatus: string | null | undefined,
): boolean {
  return visibility === "public" || membershipStatus === "active";
}
