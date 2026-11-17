import { describe, expect, it } from "vitest";
import { isHeartbeatFresh } from "./presenceFreshness.js";

describe("lease-aware presence freshness", () => {
  const now = 1_800_000_000_000;

  it("accepts a heartbeat within a 30-second lease", () => {
    expect(isHeartbeatFresh(now - 29_999, now, 30_000)).toBe(true);
  });

  it("accepts an idle heartbeat within a configured 5-minute lease", () => {
    expect(isHeartbeatFresh(now - 90_000, now, 300_000)).toBe(true);
  });

  it("rejects a heartbeat older than the ownership lease", () => {
    expect(isHeartbeatFresh(now - 300_001, now, 300_000)).toBe(false);
  });

  it("allows small clock skew but rejects excessive future timestamps", () => {
    expect(isHeartbeatFresh(now + 5_000, now, 30_000)).toBe(true);
    expect(isHeartbeatFresh(now + 5_001, now, 30_000)).toBe(false);
  });

  it("rejects malformed timestamps and invalid lease settings", () => {
    expect(isHeartbeatFresh(Number.NaN, now, 30_000)).toBe(false);
    expect(isHeartbeatFresh("not-a-time", now, 30_000)).toBe(false);
    expect(isHeartbeatFresh(now, now, 0)).toBe(false);
    expect(isHeartbeatFresh(now, Number.NaN, 30_000)).toBe(false);
  });
});
