import type { PoolClient } from "pg";

export type NotificationKind = "friend_request" | "friend_accepted" | "chat_message" | "system";

export async function addNotification(
  client: PoolClient,
  input: {
    userId: string;
    actorId?: string | null;
    kind: NotificationKind;
    payload?: Record<string, unknown>;
    dedupeKey?: string;
  },
) {
  await client.query(
    `INSERT INTO player_notifications (user_id, actor_id, kind, payload, dedupe_key)
     SELECT $1, $2, $3, $4::jsonb, $5
      WHERE NOT EXISTS (
        SELECT 1 FROM player_notification_preferences
         WHERE user_id = $1 AND kind = $3 AND in_app_enabled = false
      )
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
    [
      input.userId,
      input.actorId ?? null,
      input.kind,
      JSON.stringify(input.payload ?? {}),
      input.dedupeKey ?? null,
    ],
  );
}
