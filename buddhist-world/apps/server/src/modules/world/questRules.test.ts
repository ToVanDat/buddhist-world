import { describe, expect, it } from "vitest";
import {
  QuestDefinitionConfigurationError,
  validateQuestObjectives,
  validateQuestProgress,
  validateQuestRewards,
} from "./questRules.js";

describe("quest content contract", () => {
  it("accepts valid interaction objectives and reward stacks", () => {
    expect(validateQuestObjectives([{ type: "interact", targetId: "temple_bell", count: 2, label: "Thỉnh chuông" }]))
      .toHaveLength(1);
    expect(validateQuestRewards([{ itemId: "incense_bundle", quantity: 2 }]))
      .toEqual([{ itemId: "incense_bundle", quantity: 2 }]);
  });

  it("rejects duplicate targets because progress is keyed by target ID", () => {
    expect(() => validateQuestObjectives([
      { type: "interact", targetId: "temple_bell", count: 1 },
      { type: "interact", targetId: "temple_bell", count: 2 },
    ])).toThrow(QuestDefinitionConfigurationError);
  });

  it("rejects unsupported, non-positive and malformed objective/reward values", () => {
    expect(() => validateQuestObjectives([{ type: "visit", targetId: "temple_bell", count: 1 }]))
      .toThrow(QuestDefinitionConfigurationError);
    expect(() => validateQuestObjectives([{ type: "interact", targetId: "temple_bell", count: 0 }]))
      .toThrow(QuestDefinitionConfigurationError);
    expect(() => validateQuestRewards([{ itemId: "../item", quantity: 1 }]))
      .toThrow(QuestDefinitionConfigurationError);
    expect(() => validateQuestRewards([{ itemId: "incense_bundle", quantity: 1 }, { itemId: "incense_bundle", quantity: 2 }]))
      .toThrow(QuestDefinitionConfigurationError);
  });

  it("accepts empty progress but rejects negative, fractional and unsafe counters", () => {
    expect(validateQuestProgress(null)).toEqual({});
    expect(validateQuestProgress({ temple_bell: 2 })).toEqual({ temple_bell: 2 });
    expect(() => validateQuestProgress({ temple_bell: -1 })).toThrow(QuestDefinitionConfigurationError);
    expect(() => validateQuestProgress({ temple_bell: 1.5 })).toThrow(QuestDefinitionConfigurationError);
  });
});
