-- Player safety reports and moderation case workflow. Additive only.
CREATE TABLE player_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reported_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('harassment', 'spam', 'disruptive_voice', 'impersonation', 'inappropriate_content', 'other')),
  details text NOT NULL CHECK (length(details) BETWEEN 10 AND 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'dismissed')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolution_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT player_reports_distinct_users CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX player_reports_queue_idx
  ON player_reports (status, created_at DESC);
CREATE INDEX player_reports_target_idx
  ON player_reports (reported_user_id, created_at DESC);
CREATE INDEX player_reports_reporter_idx
  ON player_reports (reporter_id, created_at DESC);
