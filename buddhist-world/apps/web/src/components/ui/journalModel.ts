export interface QuestObjectiveProgressInput {
  targetId: string;
  count: number;
}

export function getQuestProgress(
  objectives: readonly QuestObjectiveProgressInput[],
  progress: Readonly<Record<string, number>> | null | undefined,
): { completed: number; total: number; percent: number } {
  let total = 0;
  let completed = 0;
  for (const objective of objectives) {
    if (!Number.isSafeInteger(objective.count) || objective.count <= 0) continue;
    total += objective.count;
    const current = progress?.[objective.targetId] ?? 0;
    completed += Number.isFinite(current) ? Math.min(objective.count, Math.max(0, current)) : 0;
  }
  return { completed, total, percent: total ? Math.round((completed / total) * 100) : 0 };
}
