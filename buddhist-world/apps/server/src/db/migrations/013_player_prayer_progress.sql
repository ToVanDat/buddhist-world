-- Self-reported prayer counter progress; never used as an authoritative reward signal.
CREATE TABLE player_prayer_progress (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  repetition_count integer NOT NULL DEFAULT 0 CHECK (repetition_count >= 0),
  target integer NOT NULL DEFAULT 108 CHECK (target IN (27, 54, 108, 216)),
  completed_sessions integer NOT NULL DEFAULT 0 CHECK (completed_sessions >= 0),
  last_session_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_prayer_progress_count_within_target CHECK (repetition_count <= target)
);
