import { WORLD_INTERACTIONS, type NpcWorldSnapshot, type WorldInteractionDef, type Vec3 } from "@bw/shared";

/** Find the closest server-defined interaction in the active region. */
export function findNearbyWorldInteraction(
  position: Vec3,
  regionId: string,
  npcStates: Record<string, NpcWorldSnapshot> = {},
): WorldInteractionDef | null {
  let nearest: WorldInteractionDef | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const definition of WORLD_INTERACTIONS) {
    if (definition.regionId !== regionId) continue;
    if (definition.kind === "npc" && npcStates[definition.id]?.active === false) continue;
    const npcPosition = definition.kind === "npc" ? npcStates[definition.id]?.state?.position : undefined;
    const target = npcPosition ? { ...definition, position: npcPosition } : definition;
    const distance = Math.hypot(position[0] - target.position[0], position[2] - target.position[2]);
    if (Math.abs(position[1] - target.position[1]) > 3.5 || distance > target.radius) continue;
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  return nearest;
}
