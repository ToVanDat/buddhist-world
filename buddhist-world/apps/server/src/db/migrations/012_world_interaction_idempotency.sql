-- Durable idempotency for authoritative world interactions.
-- The quest progress snapshot is committed in the same transaction as quest/reward changes.
CREATE TABLE world_interaction_requests (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 64),
  quest_updates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(quest_updates) = 'array'),
  response jsonb CHECK (response IS NULL OR jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, request_id)
);
CREATE INDEX world_interaction_requests_created_idx
  ON world_interaction_requests (created_at);

-- Prevent duplicate journal events when a committed interaction response is replayed.
ALTER TABLE world_events ADD COLUMN request_id uuid;
CREATE UNIQUE INDEX world_events_actor_request_uidx
  ON world_events (actor_user_id, request_id)
  WHERE actor_user_id IS NOT NULL AND request_id IS NOT NULL;
