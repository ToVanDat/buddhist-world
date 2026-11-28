-- Append-only interaction history for a persistent online-world journal.
CREATE TABLE world_events (
  id bigserial PRIMARY KEY,
  region_id text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text NOT NULL,
  target_id text NOT NULL,
  interaction_kind text NOT NULL CHECK (interaction_kind IN ('bell','incense','buddha','altar','npc')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX world_events_region_created_idx ON world_events (region_id, created_at DESC);
CREATE INDEX world_events_actor_created_idx ON world_events (actor_user_id, created_at DESC);
