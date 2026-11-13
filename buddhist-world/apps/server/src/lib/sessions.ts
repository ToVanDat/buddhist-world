import { pool } from "../db/pool.js";

/** Access token chỉ hợp lệ khi session tương ứng vẫn còn active trong PostgreSQL. */
export async function isSessionActive(sessionId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM player_sessions
      WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now()`,
    [sessionId, userId],
  );
  return result.rowCount === 1;
}
