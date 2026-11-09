import { pool } from "../../db/pool.js";

export interface QuestObjective { type: string; targetId: string; count: number; label?: string }
export interface QuestReward { itemId: string; quantity: number }
interface ActiveQuestRow {
  quest_id: string;
  title: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  progress: Record<string, number>;
}

export function advanceInteractionProgress(
  objectives: readonly QuestObjective[],
  current: Record<string, number>,
  targetId: string,
): { progress: Record<string, number>; completed: boolean } {
  const progress = { ...current };
  for (const objective of objectives) {
    if (objective.type === "interact" && objective.targetId === targetId) {
      progress[targetId] = Math.min(objective.count, (progress[targetId] ?? 0) + 1);
    }
  }
  return {
    progress,
    completed: objectives.length > 0 && objectives.every((objective) =>
      (progress[objective.targetId] ?? 0) >= objective.count),
  };
}

export interface QuestProgressUpdate {
  questId: string;
  title: string;
  progress: Record<string, number>;
  completed: boolean;
  rewards: QuestReward[];
}

/** Update only server-defined objectives matching an interaction that the server has already validated. */
export async function recordWorldInteractionProgress(userId: string, targetId: string): Promise<QuestProgressUpdate[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const active = await client.query<ActiveQuestRow>(
      `SELECT pq.quest_id, q.title, q.objectives, q.rewards, pq.progress
         FROM player_quests pq
         JOIN world_quests q ON q.id = pq.quest_id
        WHERE pq.user_id = $1 AND pq.status = 'active' AND q.is_active = true
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(q.objectives) objective
             WHERE objective->>'type' = 'interact' AND objective->>'targetId' = $2
          )
        FOR UPDATE OF pq`,
      [userId, targetId],
    );
    const updates: QuestProgressUpdate[] = [];
    for (const quest of active.rows) {
      const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
      const { progress, completed } = advanceInteractionProgress(objectives, quest.progress ?? {}, targetId);
      await client.query(
        `UPDATE player_quests SET progress = $3::jsonb,
           status = CASE WHEN $4 THEN 'completed' ELSE status END,
           completed_at = CASE WHEN $4 THEN now() ELSE completed_at END
         WHERE user_id = $1 AND quest_id = $2`,
        [userId, quest.quest_id, JSON.stringify(progress), completed],
      );
      const rewards = completed && Array.isArray(quest.rewards) ? quest.rewards : [];
      if (completed) {
        for (const reward of rewards) {
          if (!reward.itemId || !Number.isInteger(reward.quantity) || reward.quantity <= 0) continue;
          await client.query(
            `INSERT INTO player_inventory (user_id, item_id, quantity)
             SELECT $1, id, LEAST(stack_limit, $3) FROM world_items WHERE id = $2
             ON CONFLICT (user_id, item_id) DO UPDATE
               SET quantity = LEAST(
                 (SELECT stack_limit FROM world_items WHERE id = EXCLUDED.item_id),
                 player_inventory.quantity + EXCLUDED.quantity
               ),
               updated_at = now()`,
            [userId, reward.itemId, reward.quantity],
          );
        }
      }
      updates.push({ questId: quest.quest_id, title: quest.title, progress, completed, rewards });
    }
    await client.query("COMMIT");
    return updates;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
