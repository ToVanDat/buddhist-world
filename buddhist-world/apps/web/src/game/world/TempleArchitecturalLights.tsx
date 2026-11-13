import { ArchitecturalLighting, type ArchitecturalLightDefinition } from "../lighting/ArchitecturalLighting";

// Temporary fixture positions are aligned to the current TempleRegion blockout.
// Replace/move these definitions only alongside authored lantern/architectural assets.
const TEMPLE_COMPLEX_LIGHTS: ArchitecturalLightDefinition[] = [
  { id: "tam-quan-west", regionId: "temple_complex", priority: 100, config: { kind: "point", color: "#ffc887", intensity: 2.2, position: [-4.5, 3.2, 19], distance: 13, decay: 2 } },
  { id: "tam-quan-east", regionId: "temple_complex", priority: 100, config: { kind: "point", color: "#ffc887", intensity: 2.2, position: [4.5, 3.2, 19], distance: 13, decay: 2 } },
  { id: "main-hall-west", regionId: "temple_complex", priority: 95, config: { kind: "spot", color: "#ffcf9a", intensity: 3.1, position: [-7, 5.2, -13], target: [-7, 0, -22], distance: 18, angle: Math.PI / 4, penumbra: 0.8, decay: 2 } },
  { id: "main-hall-east", regionId: "temple_complex", priority: 95, config: { kind: "spot", color: "#ffcf9a", intensity: 3.1, position: [7, 5.2, -13], target: [7, 0, -22], distance: 18, angle: Math.PI / 4, penumbra: 0.8, decay: 2 } },
  { id: "courtyard-west-north", regionId: "temple_complex", priority: 70, config: { kind: "point", color: "#ffd19b", intensity: 1.25, position: [-3.5, 2.2, 9], distance: 10, decay: 2 } },
  { id: "courtyard-east-north", regionId: "temple_complex", priority: 70, config: { kind: "point", color: "#ffd19b", intensity: 1.25, position: [3.5, 2.2, 9], distance: 10, decay: 2 } },
  { id: "courtyard-west-south", regionId: "temple_complex", priority: 70, config: { kind: "point", color: "#ffd19b", intensity: 1.25, position: [-3.5, 2.2, -8], distance: 10, decay: 2 } },
  { id: "courtyard-east-south", regionId: "temple_complex", priority: 70, config: { kind: "point", color: "#ffd19b", intensity: 1.25, position: [3.5, 2.2, -8], distance: 10, decay: 2 } },
  { id: "lotus-pond-west", regionId: "temple_complex", priority: 55, config: { kind: "point", color: "#e7b878", intensity: 1.1, position: [-24, 2, 4], distance: 11, decay: 2 } },
  { id: "lotus-pond-east", regionId: "temple_complex", priority: 55, config: { kind: "point", color: "#e7b878", intensity: 1.1, position: [-12, 2, 4], distance: 11, decay: 2 } },
];

export function TempleArchitecturalLights() {
  return <ArchitecturalLighting regionId="temple_complex" lights={TEMPLE_COMPLEX_LIGHTS} />;
}
