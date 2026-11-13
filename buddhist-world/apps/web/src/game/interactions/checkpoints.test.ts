import { describe, expect, it } from "vitest";
import { findNearbyCheckpoint } from "./checkpoints";
import { REGIONS } from "@bw/shared";

describe("temple checkpoint proximity", () => {
  it("places the entrance checkpoint at the Tam Quan blockout", () => {
    expect(REGIONS.temple_complex?.spawns.find((spawn) => spawn.id === "main_entrance")?.position).toEqual([0, 1.2, 20]);
    expect(findNearbyCheckpoint([1, 1, 20])?.id).toBe("main_entrance");
  });

  it("returns the nearest checkpoint when interaction zones overlap", () => {
    expect(findNearbyCheckpoint([0, 1, 2])?.id).toBe("courtyard");
  });

  it("does not expose a prompt when the player is outside every checkpoint radius", () => {
    expect(findNearbyCheckpoint([70, 1, 70])).toBeNull();
  });

  it("places the main hall checkpoint at the main hall blockout", () => {
    expect(REGIONS.temple_complex?.spawns.find((spawn) => spawn.id === "main_hall")?.position).toEqual([0, 1.2, -22]);
    expect(findNearbyCheckpoint([0, 1, -22])?.id).toBe("main_hall");
  });

  it("places the lotus pond checkpoint at the pond blockout", () => {
    expect(REGIONS.temple_complex?.spawns.find((spawn) => spawn.id === "lotus_pond")?.position).toEqual([-18, 1.2, 4]);
    expect(findNearbyCheckpoint([-18, 1, 4])?.id).toBe("lotus_pond");
  });
});
