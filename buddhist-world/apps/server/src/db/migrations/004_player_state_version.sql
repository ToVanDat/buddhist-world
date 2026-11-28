-- Separate movement snapshot ordering from checkpoint metadata updates.
-- Checkpoint selection updates updated_at and spawn coordinates, but must not
-- invalidate a newer in-memory movement snapshot waiting to be persisted.
ALTER TABLE player_locations
  ADD COLUMN IF NOT EXISTS state_updated_at timestamptz NOT NULL DEFAULT '-infinity'::timestamptz;

UPDATE player_locations
   SET state_updated_at = updated_at
 WHERE state_updated_at = '-infinity'::timestamptz;
