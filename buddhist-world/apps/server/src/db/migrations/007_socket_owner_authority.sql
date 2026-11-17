-- Additive durable authority for socket ownership; no existing gameplay data is modified.
CREATE TABLE IF NOT EXISTS socket_owner_authority (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  owner_token text NOT NULL,
  owner_epoch bigint NOT NULL CHECK (owner_epoch > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE player_locations ADD COLUMN IF NOT EXISTS checkpoint_seq bigint NOT NULL DEFAULT -1;
CREATE INDEX IF NOT EXISTS socket_owner_authority_epoch_idx ON socket_owner_authority (owner_epoch);
