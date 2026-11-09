export class QuestRewardConfigurationError extends Error {
  readonly code = "quest_reward_invalid";

  constructor(itemId: string) {
    super(`Quest reward references an invalid or unavailable item: ${itemId || "(empty)"}`);
    this.name = "QuestRewardConfigurationError";
  }
}

export class QuestRewardInventoryFullError extends Error {
  readonly code = "quest_reward_inventory_full";

  constructor(
    readonly itemId: string,
    readonly currentQuantity: number,
    readonly requestedQuantity: number,
    readonly stackLimit: number,
  ) {
    super(`Inventory stack for ${itemId} cannot fit the full quest reward.`);
    this.name = "QuestRewardInventoryFullError";
  }
}

/**
 * Calculate a complete reward stack before writing it.
 * Never clamp a reward: the caller must either grant every item or roll back.
 */
export function calculateRewardQuantity(
  itemId: string,
  rewardQuantity: number,
  currentQuantity: number,
  stackLimit: number,
): number {
  if (!/^[a-z0-9_-]{1,64}$/i.test(itemId) ||
      !Number.isSafeInteger(rewardQuantity) || rewardQuantity <= 0 ||
      !Number.isSafeInteger(currentQuantity) || currentQuantity < 0 ||
      !Number.isSafeInteger(stackLimit) || stackLimit <= 0 ||
      currentQuantity > stackLimit) {
    throw new QuestRewardConfigurationError(itemId);
  }

  const nextQuantity = currentQuantity + rewardQuantity;
  if (!Number.isSafeInteger(nextQuantity)) {
    throw new QuestRewardConfigurationError(itemId);
  }
  if (nextQuantity > stackLimit) {
    throw new QuestRewardInventoryFullError(itemId, currentQuantity, rewardQuantity, stackLimit);
  }
  return nextQuantity;
}
