-- Preserve the player's horizontal facing direction across reconnects and region changes.
ALTER TABLE player_locations
  ADD COLUMN IF NOT EXISTS yaw real NOT NULL DEFAULT 0;
