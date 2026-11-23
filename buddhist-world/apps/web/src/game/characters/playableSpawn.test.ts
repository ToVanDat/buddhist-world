import { describe, expect, it } from "vitest";
import { DEFAULT_REGION_ID, REGIONS } from "@bw/shared";
import { resolvePlayableSpawn } from "./playableSpawn";

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

  it("returns no spawn for an unknown or empty region", () => {
    expect(resolvePlayableSpawn(null, undefined)).toBeNull();
    expect(resolvePlayableSpawn(null, { ...region, spawns: [] })).toBeNull();
  });
});
