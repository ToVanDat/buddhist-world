-- Persist optional temple-tour visits per authenticated player and region.
-- A visit is written only after the API verifies fresh server presence near a manifest stop.
CREATE TABLE player_tour_progress (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id text NOT NULL CHECK (length(region_id) BETWEEN 1 AND 64),
  visited_spawn_ids text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, region_id)
);

CREATE INDEX player_tour_progress_updated_idx
  ON player_tour_progress (updated_at DESC);
