import { WORLD_INTERACTIONS, type NpcWorldSnapshot, type WorldInteractionDef, type Vec3 } from "@bw/shared";

function isFinitePosition(value: Vec3): boolean {
  return value.every(Number.isFinite);
}

/** Find the closest server-defined interaction in the active region. */
export function findNearbyWorldInteraction(
  position: Vec3,
  regionId: string,
  npcStates: Record<string, NpcWorldSnapshot> = {},
): WorldInteractionDef | null {
  if (!isFinitePosition(position)) return null;

  let nearest: WorldInteractionDef | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const definition of WORLD_INTERACTIONS) {
    if (definition.regionId !== regionId) continue;
    if (definition.kind === "npc" && npcStates[definition.id]?.active === false) continue;
    const npcPosition = definition.kind === "npc" ? npcStates[definition.id]?.state?.position : undefined;
    // A malformed live NPC snapshot must not silently fall back to a stale registry coordinate.
    if (npcPosition && !isFinitePosition(npcPosition)) continue;
    const target = npcPosition ? { ...definition, position: npcPosition } : definition;
    if (!isFinitePosition(target.position) || !Number.isFinite(target.radius) || target.radius <= 0) continue;
    const distance = Math.hypot(position[0] - target.position[0], position[2] - target.position[2]);
    // Keep interaction reach on the same floor; a wide vertical tolerance lets
    // players trigger props through an upper/lower level or thick temple platform.
    if (Math.abs(position[1] - target.position[1]) > 2 || distance > target.radius) continue;
    if (distance < nearestDistance) {
      nearest = target;
      nearestDistance = distance;
    }
  }
  return nearest;
}
