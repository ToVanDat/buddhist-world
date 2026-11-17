import { describe, expect, it } from "vitest";
import { isSkeletonProfileCompatible } from "./skeletonCompatibility.js";

describe("character skeleton compatibility", () => {
  it("allows items that do not declare a skeleton requirement", () => {
    expect(isSkeletonProfileCompatible(null, null)).toBe(true);
    expect(isSkeletonProfileCompatible(null, "humanoid-v1")).toBe(true);
  });

  it("allows an item when its required skeleton matches the base model", () => {
    expect(isSkeletonProfileCompatible("humanoid-v1", "humanoid-v1")).toBe(true);
  });

  it("rejects an item when the model has no skeleton metadata", () => {
    expect(isSkeletonProfileCompatible("humanoid-v1", null)).toBe(false);
  });

  it("rejects an item when the skeleton profiles differ", () => {
    expect(isSkeletonProfileCompatible("humanoid-v1", "humanoid-v2")).toBe(false);
  });
});
