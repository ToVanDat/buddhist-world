-- Prevent a stale gateway from overwriting a newer socket owner's location.
-- Epochs are monotonically allocated from Redis and persisted with the location row.
ALTER TABLE player_locations
  ADD COLUMN IF NOT EXISTS owner_epoch bigint NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS player_locations_owner_epoch_idx
  ON player_locations (owner_epoch);
