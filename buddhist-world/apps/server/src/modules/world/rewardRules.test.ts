import { describe, expect, it } from "vitest";
import {
  calculateRewardQuantity,
  QuestRewardConfigurationError,
  QuestRewardInventoryFullError,
} from "./rewardRules.js";

describe("calculateRewardQuantity", () => {
  it("grants the complete reward when a new stack has room", () => {
    expect(calculateRewardQuantity("lotus_token", 3, 0, 99)).toBe(3);
  });

  it("adds the complete reward to an existing stack", () => {
    expect(calculateRewardQuantity("incense_bundle", 2, 4, 20)).toBe(6);
  });

  it("allows a stack to reach its exact limit", () => {
    expect(calculateRewardQuantity("temple_badge", 1, 0, 1)).toBe(1);
  });

  it("rejects a reward that would overflow instead of silently truncating it", () => {
    expect(() => calculateRewardQuantity("incense_bundle", 2, 19, 20))
      .toThrow(QuestRewardInventoryFullError);
  });

  it("rejects a reward larger than the item's stack limit", () => {
    expect(() => calculateRewardQuantity("temple_badge", 2, 0, 1))
      .toThrow(QuestRewardInventoryFullError);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid reward quantity %s",
    (quantity) => {
      expect(() => calculateRewardQuantity("lotus_token", quantity, 0, 99))
        .toThrow(QuestRewardConfigurationError);
    },
  );

  it("rejects invalid item identifiers and invalid inventory state", () => {
    expect(() => calculateRewardQuantity("../item", 1, 0, 99))
      .toThrow(QuestRewardConfigurationError);
    expect(() => calculateRewardQuantity("lotus_token", 1, -1, 99))
      .toThrow(QuestRewardConfigurationError);
    expect(() => calculateRewardQuantity("lotus_token", 1, 0, 0))
      .toThrow(QuestRewardConfigurationError);
  });
});
