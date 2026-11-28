import { describe, expect, it } from "vitest";
import { DEFAULT_REGION_ID, REGIONS } from "@bw/shared";
import { isSafeSpawn, resolvePlayableSpawn } from "./playableSpawn";

describe("resolvePlayableSpawn", () => {
  const region = REGIONS[DEFAULT_REGION_ID]!;

  it("prefers the authoritative server spawn when it is available", () => {
    const serverSpawn = { position: [4, 1, 8] as [number, number, number], yaw: 1.25 };
    expect(resolvePlayableSpawn(serverSpawn, region)).toEqual({
      spawn: serverSpawn,
      source: "server",
    });
  });

  it("uses the region default spawn while the server has not supplied one", () => {
    const result = resolvePlayableSpawn(null, region);
    const expected = region.spawns.find((point) => point.id === region.defaultSpawn)!;
    expect(result).toEqual({
      spawn: { position: expected.position, yaw: expected.yaw },
      source: "manifest",
    });
  });

  it("rejects malformed, out-of-bounds and pond-overlapping server spawns", () => {
    expect(isSafeSpawn({ position: [500, 1, 0], yaw: 0 }, region)).toBe(false);
    expect(isSafeSpawn({ position: [0, Number.NaN, 0], yaw: 0 }, region)).toBe(false);
    expect(isSafeSpawn({ position: [0, 1, 0], yaw: Number.POSITIVE_INFINITY }, region)).toBe(false);
    expect(isSafeSpawn({ position: [-18, 1.2, 4], yaw: 0 }, region)).toBe(false);
  });

  it("falls back to the manifest spawn when server spawn data is unsafe", () => {
    const result = resolvePlayableSpawn({ position: [900, 0, 900], yaw: 0 }, region);
    const expected = region.spawns.find((point) => point.id === region.defaultSpawn)!;
    expect(result).toEqual({ spawn: { position: expected.position, yaw: expected.yaw }, source: "manifest" });
  });

  it("returns no spawn for an unknown or empty region", () => {
    expect(resolvePlayableSpawn(null, undefined)).toBeNull();
    expect(resolvePlayableSpawn(null, { ...region, spawns: [] })).toBeNull();
  });
});
