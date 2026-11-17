import { z } from "zod";

const contentId = z.string().regex(/^[a-z0-9_-]{1,64}$/i);
const objectiveSchema = z.object({
  type: z.literal("interact"),
  targetId: contentId,
  count: z.number().int().positive().max(100_000),
  label: z.string().trim().max(160).optional(),
}).strict();
const rewardSchema = z.object({
  itemId: contentId,
  quantity: z.number().int().positive().max(100_000),
}).strict();

const objectivesSchema = z.array(objectiveSchema).min(1).max(64).superRefine((objectives, ctx) => {
  const targets = new Set<string>();
  objectives.forEach((objective, index) => {
    if (targets.has(objective.targetId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "targetId"], message: "Duplicate objective target IDs cannot be tracked independently." });
    }
    targets.add(objective.targetId);
  });
});
const rewardsSchema = z.array(rewardSchema).max(32).superRefine((rewards, ctx) => {
  const items = new Set<string>();
  rewards.forEach((reward, index) => {
    if (items.has(reward.itemId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "itemId"], message: "Duplicate reward item IDs must be consolidated into one stack." });
    }
    items.add(reward.itemId);
  });
});
const progressSchema = z.record(z.number().int().nonnegative().max(100_000));

export class QuestDefinitionConfigurationError extends Error {
  readonly code = "quest_definition_invalid";
  constructor(readonly field: "objectives" | "rewards" | "progress") {
    super(`Quest ${field} configuration is invalid.`);
    this.name = "QuestDefinitionConfigurationError";
  }
}

export type QuestObjective = z.infer<typeof objectiveSchema>;
export type QuestReward = z.infer<typeof rewardSchema>;

export function validateQuestObjectives(value: unknown): QuestObjective[] {
  const parsed = objectivesSchema.safeParse(value);
  if (!parsed.success) throw new QuestDefinitionConfigurationError("objectives");
  return parsed.data;
}

export function validateQuestRewards(value: unknown): QuestReward[] {
  const parsed = rewardsSchema.safeParse(value);
  if (!parsed.success) throw new QuestDefinitionConfigurationError("rewards");
  return parsed.data;
}

export function validateQuestProgress(value: unknown): Record<string, number> {
  const parsed = progressSchema.safeParse(value ?? {});
  if (!parsed.success) throw new QuestDefinitionConfigurationError("progress");
  return parsed.data;
}
