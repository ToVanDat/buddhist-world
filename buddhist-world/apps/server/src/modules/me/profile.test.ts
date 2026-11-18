import { describe, expect, it } from "vitest";
import { profileBody } from "@bw/shared";

describe("profileBody", () => {
  it("accepts Vietnamese display names and trims surrounding whitespace", () => {
    expect(profileBody.parse({ displayName: "  Tô Văn Đạt  " })).toEqual({
      displayName: "Tô Văn Đạt",
    });
  });

  it("accepts spaces and common punctuation in display names", () => {
    expect(profileBody.safeParse({ displayName: "An-Nhi 2" }).success).toBe(true);
    expect(profileBody.safeParse({ displayName: "Minh's Path" }).success).toBe(true);
  });

  it("rejects names that are too short or too long", () => {
    expect(profileBody.safeParse({ displayName: "A" }).success).toBe(false);
    expect(profileBody.safeParse({ displayName: "A".repeat(33) }).success).toBe(false);
  });

  it("rejects markup and unsupported symbols", () => {
    expect(profileBody.safeParse({ displayName: "<script>" }).success).toBe(false);
    expect(profileBody.safeParse({ displayName: "Player🔥" }).success).toBe(false);
  });
});
