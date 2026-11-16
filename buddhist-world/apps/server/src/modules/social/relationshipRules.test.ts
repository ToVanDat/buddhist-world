import { describe, expect, it } from "vitest";
import {
  isDistinctUserPair,
  isResendableRequestStatus,
  relationshipLockKey,
} from "./relationshipRules.js";

describe("social relationship rules", () => {
  it("uses one advisory-lock key for either direction of a pair", () => {
    expect(relationshipLockKey("user-b", "user-a"))
      .toBe(relationshipLockKey("user-a", "user-b"));
  });

  it("does not allow a self relationship", () => {
    expect(isDistinctUserPair("same", "same")).toBe(false);
    expect(isDistinctUserPair("", "other")).toBe(false);
    expect(isDistinctUserPair("first", "second")).toBe(true);
  });

  it("allows a declined, cancelled or removed request to be sent again", () => {
    expect(isResendableRequestStatus("declined")).toBe(true);
    expect(isResendableRequestStatus("cancelled")).toBe(true);
    expect(isResendableRequestStatus("removed")).toBe(true);
    expect(isResendableRequestStatus("pending")).toBe(false);
    expect(isResendableRequestStatus("accepted")).toBe(false);
  });
});
