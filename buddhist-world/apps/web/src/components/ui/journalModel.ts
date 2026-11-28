export interface QuestObjectiveProgressInput {
  targetId: string;
  count: number;
}
export interface QuestObjectiveView extends QuestObjectiveProgressInput { label?: string }
export interface ActiveQuestView {
  id: string;
  title: string;
  objectives: QuestObjectiveView[];
  progress: Record<string, number>;
  status: "active";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Treat the API payload as untrusted JSON so malformed authored content cannot crash the HUD. */
export function normalizeActiveQuests(value: unknown): ActiveQuestView[] {
  if (!Array.isArray(value)) return [];
  const quests: ActiveQuestView[] = [];
  const seen = new Set<string>();
  for (const raw of value.slice(0, 200)) {
    if (!isRecord(raw) || raw.status !== "active" ||
        typeof raw.id !== "string" || !/^[a-z0-9_-]{1,64}$/i.test(raw.id) ||
        seen.has(raw.id) || typeof raw.title !== "string" || !raw.title.trim()) continue;
    seen.add(raw.id);
    const objectives: QuestObjectiveView[] = [];
    if (Array.isArray(raw.objectives)) {
      const objectiveIds = new Set<string>();
      for (const item of raw.objectives.slice(0, 100)) {
        if (!isRecord(item) || typeof item.targetId !== "string" ||
            !/^[a-z0-9_.:-]{1,96}$/i.test(item.targetId) ||
            !Number.isSafeInteger(item.count) || (item.count as number) <= 0 ||
            objectiveIds.has(item.targetId)) continue;
        objectiveIds.add(item.targetId);
        objectives.push({
          targetId: item.targetId,
          count: item.count as number,
          ...(typeof item.label === "string" && item.label.trim()
            ? { label: item.label.trim().slice(0, 120) } : {}),
        });
      }
    }
    const progress: Record<string, number> = {};
    if (isRecord(raw.progress)) {
      for (const [targetId, amount] of Object.entries(raw.progress)) {
        if (objectives.some((objective) => objective.targetId === targetId) &&
            typeof amount === "number" && Number.isFinite(amount) && amount >= 0) {
          progress[targetId] = amount;
        }
      }
    }
    quests.push({ id: raw.id, title: raw.title.trim().slice(0, 160), objectives, progress, status: "active" });
  }
  return quests;
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
