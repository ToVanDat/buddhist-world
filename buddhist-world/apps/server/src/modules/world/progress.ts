import { pool } from "../../db/pool.js";
export { QuestRewardConfigurationError, QuestRewardInventoryFullError } from "./rewardRules.js";
import {
  calculateRewardQuantity,
  QuestRewardConfigurationError,
} from "./rewardRules.js";

interface QuestObjective { type: string; targetId: string; count: number; label?: string }
interface QuestReward { itemId: string; quantity: number }
interface ActiveQuestRow {
  quest_id: string;
  title: string;
  objectives: QuestObjective[];
  rewards: QuestReward[];
  progress: Record<string, number>;
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
        ORDER BY pq.quest_id
        FOR UPDATE OF pq`,
      [userId, targetId],
    );
    const updates: QuestProgressUpdate[] = [];
    for (const quest of active.rows) {
      const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
      const progress = { ...(quest.progress ?? {}) };
      for (const objective of objectives) {
        if (objective.type === "interact" && objective.targetId === targetId) {
          progress[targetId] = Math.min(objective.count, (progress[targetId] ?? 0) + 1);
        }
      }
      const completed = objectives.length > 0 && objectives.every((objective) =>
        (progress[objective.targetId] ?? 0) >= objective.count);
      const rewards = completed ? quest.rewards : [];
      if (completed && !Array.isArray(rewards)) {
        throw new QuestRewardConfigurationError("");
      }

      // Lock and validate all reward stacks before committing quest completion.
      // Sorting gives concurrent quests a consistent item-lock order.
      if (completed) {
        for (const reward of [...rewards].sort((a, b) => String(a?.itemId ?? "").localeCompare(String(b?.itemId ?? "")))) {
          const itemId = typeof reward?.itemId === "string" ? reward.itemId : "";
          const item = await client.query<{ stack_limit: number }>(
            "SELECT stack_limit FROM world_items WHERE id = $1 FOR UPDATE",
            [itemId],
          );
          if (!item.rows[0]) throw new QuestRewardConfigurationError(itemId);

          const inventory = await client.query<{ quantity: number }>(
            "SELECT quantity FROM player_inventory WHERE user_id = $1 AND item_id = $2 FOR UPDATE",
            [userId, itemId],
          );
          const nextQuantity = calculateRewardQuantity(
            itemId,
            reward.quantity,
            inventory.rows[0]?.quantity ?? 0,
            item.rows[0].stack_limit,
          );
          await client.query(
            `INSERT INTO player_inventory (user_id, item_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, item_id) DO UPDATE
               SET quantity = EXCLUDED.quantity, updated_at = now()`,
            [userId, itemId, nextQuantity],
          );
        }
      }

      await client.query(
        `UPDATE player_quests SET progress = $3::jsonb,
           status = CASE WHEN $4 THEN 'completed' ELSE status END,
           completed_at = CASE WHEN $4 THEN now() ELSE completed_at END
         WHERE user_id = $1 AND quest_id = $2`,
        [userId, quest.quest_id, JSON.stringify(progress), completed],
      );
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
