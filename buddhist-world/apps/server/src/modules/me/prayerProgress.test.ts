import { describe, expect, it } from "vitest";
import { prayerProgressBody } from "./prayerProgress.js";

describe("prayerProgressBody", () => {
  it("accepts a bounded self-reported progress record", () => {
    expect(prayerProgressBody.parse({
      count: 54, target: 108, sessions: 2, lastSessionAt: "2026-11-22T10:00:00.000Z",
    })).toMatchObject({ count: 54, target: 108, sessions: 2 });
  });

  it("accepts an empty progress record", () => {
    expect(prayerProgressBody.parse({
      count: 0, target: 108, sessions: 0, lastSessionAt: null,
    }).count).toBe(0);
  });

  it("rejects counts above the selected target", () => {
    expect(prayerProgressBody.safeParse({
      count: 109, target: 108, sessions: 0, lastSessionAt: null,
    }).success).toBe(false);
  });

  it("rejects unsupported targets, negative values, malformed dates and unknown fields", () => {
    expect(prayerProgressBody.safeParse({ count: 0, target: 100, sessions: 0, lastSessionAt: null }).success).toBe(false);
    expect(prayerProgressBody.safeParse({ count: -1, target: 108, sessions: 0, lastSessionAt: null }).success).toBe(false);
    expect(prayerProgressBody.safeParse({ count: 0, target: 108, sessions: 0, lastSessionAt: "yesterday" }).success).toBe(false);
    expect(prayerProgressBody.safeParse({ count: 0, target: 108, sessions: 0, lastSessionAt: null, userId: "another-user" }).success).toBe(false);
  });
});
