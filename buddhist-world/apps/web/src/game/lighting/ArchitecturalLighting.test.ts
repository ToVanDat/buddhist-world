import { describe, expect, it } from "vitest";
import { selectArchitecturalLights, type ArchitecturalLightDefinition } from "./ArchitecturalLighting";

const lights: ArchitecturalLightDefinition[] = [
  { id: "lantern-west", regionId: "temple_complex", priority: 2, config: { kind: "point", color: "#ffbb77", intensity: 1, position: [-2, 2, 0] } },
  { id: "hall-main", regionId: "temple_complex", priority: 10, config: { kind: "spot", color: "#ffd5a0", intensity: 2, position: [0, 5, 4], target: [0, 0, -2] } },
  { id: "garden-east", regionId: "temple_complex", priority: 2, config: { kind: "point", color: "#ffbb77", intensity: 0.8, position: [3, 2, 0] } },
  { id: "other-region", regionId: "mountain_retreat", priority: 20, config: { kind: "point", color: "#ffffff", intensity: 1, position: [0, 2, 0] } },
];

describe("region-scoped architectural light budget", () => {
  it("filters lights to the active region", () => {
    expect(selectArchitecturalLights(lights, "temple_complex", 8).map((light) => light.id))
      .not.toContain("other-region");
  });

  it("keeps the highest-priority lights within the quality budget", () => {
    expect(selectArchitecturalLights(lights, "temple_complex", 2).map((light) => light.id))
      .toEqual(["hall-main", "garden-east"]);
  });

  it("uses a stable ID tie-breaker for equal priorities", () => {
    expect(selectArchitecturalLights(lights, "temple_complex", 3).map((light) => light.id))
      .toEqual(["hall-main", "garden-east", "lantern-west"]);
  });

  it("returns no lights when the budget is zero", () => {
    expect(selectArchitecturalLights(lights, "temple_complex", 0)).toEqual([]);
  });
});
