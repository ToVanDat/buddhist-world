-- Preserve facing direction. Existing rows remain NULL so the region manifest's spawn yaw is used
-- until that player is next saved; new registrations/checkpoints write an explicit yaw.
ALTER TABLE player_locations
  ADD COLUMN IF NOT EXISTS yaw real;
