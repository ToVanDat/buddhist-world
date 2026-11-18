import { describe, expect, it } from "vitest";
import { progressiveCooldownSeconds } from "./loginProtectionPolicy.js";

describe("progressive login cooldown policy", () => {
  it.each([
    [0, 0], [1, 0], [3, 0], [4, 30], [5, 30], [6, 60], [7, 60],
    [8, 300], [9, 300], [10, 900], [11, 900], [12, 1800], [20, 1800],
  ])("uses %i failed attempts => %i seconds", (failures, expected) => {
    expect(progressiveCooldownSeconds(failures)).toBe(expected);
  });
});
