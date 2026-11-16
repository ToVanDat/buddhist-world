CREATE TABLE player_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('friend_request', 'friend_accepted', 'chat_message', 'system')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  dedupe_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE UNIQUE INDEX player_notifications_dedupe_uq
  ON player_notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX player_notifications_user_unread_idx
  ON player_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX player_notifications_user_history_idx
  ON player_notifications (user_id, created_at DESC, id DESC);

CREATE TABLE player_notification_preferences (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('friend_request', 'friend_accepted', 'chat_message', 'system')),
  in_app_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
