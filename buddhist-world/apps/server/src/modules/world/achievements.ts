import { pool } from "../../db/pool.js";

export interface UnlockedAchievement {
  id: string;
  title: string;
  description: string;
  icon: string;
}

/** Evaluate achievements only from durable world events written by the server. */
export async function recordWorldAchievements(userId: string): Promise<UnlockedAchievement[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const definitions = await client.query<{
      id: string; title: string; description: string; icon: string;
      target_ids: string[]; required_count: number;
    }>(
      `SELECT id, title, description, icon, target_ids, required_count
         FROM world_achievements
        WHERE is_active = true
        ORDER BY id`,
    );
    const unlocked: UnlockedAchievement[] = [];
    for (const achievement of definitions.rows) {
      const progress = await client.query<{ count: number }>(
        `SELECT count(DISTINCT target_id)::int AS count
           FROM world_events
          WHERE actor_user_id = $1 AND target_id = ANY($2::text[])`,
        [userId, achievement.target_ids],
      );
      if ((progress.rows[0]?.count ?? 0) < achievement.required_count) continue;
      const inserted = await client.query(
        `INSERT INTO player_achievements (user_id, achievement_id)
         VALUES ($1, $2)
         ON CONFLICT (user_id, achievement_id) DO NOTHING
         RETURNING achievement_id`,
        [userId, achievement.id],
      );
      if (inserted.rowCount) {
        unlocked.push({
          id: achievement.id,
          title: achievement.title,
          description: achievement.description,
          icon: achievement.icon,
        });
      }
    }
    await client.query("COMMIT");
    return unlocked;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
