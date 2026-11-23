import { describe, expect, it } from "vitest";
import { canViewCommunityDetails } from "./access.js";

describe("canViewCommunityDetails", () => {
  it("allows public community details regardless of membership", () => {
    expect(canViewCommunityDetails("public", null)).toBe(true);
    expect(canViewCommunityDetails("public", "left")).toBe(true);
    expect(canViewCommunityDetails("public", "banned")).toBe(true);
  });

  it("allows private community details only for active members", () => {
    expect(canViewCommunityDetails("private", "active")).toBe(true);
    expect(canViewCommunityDetails("private", "left")).toBe(false);
    expect(canViewCommunityDetails("private", "removed")).toBe(false);
    expect(canViewCommunityDetails("private", "banned")).toBe(false);
    expect(canViewCommunityDetails("private", null)).toBe(false);
    expect(canViewCommunityDetails("private", undefined)).toBe(false);
  });
});
