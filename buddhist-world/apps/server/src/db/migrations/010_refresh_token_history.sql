-- Keep replay-detection hashes out of the general audit stream.
-- Existing audit rows are retained and copied additively; no historical data is deleted.
CREATE TABLE refresh_token_history (
  token_hash text PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES player_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rotated_at timestamptz NOT NULL,
  ip text
);

CREATE INDEX refresh_token_history_session_idx
  ON refresh_token_history (session_id, rotated_at DESC);

CREATE INDEX player_sessions_expires_at_idx
  ON player_sessions (expires_at);

CREATE INDEX player_sessions_revoked_at_idx
  ON player_sessions (revoked_at)
  WHERE revoked_at IS NOT NULL;

INSERT INTO refresh_token_history (token_hash, session_id, user_id, rotated_at, ip)
SELECT DISTINCT ON (a.detail->>'rotatedTokenHash')
  a.detail->>'rotatedTokenHash',
  s.id,
  a.user_id,
  a.created_at,
  a.ip
FROM audit_logs a
JOIN player_sessions s
  ON s.id = (a.detail->>'sessionId')::uuid
 AND s.user_id = a.user_id
WHERE a.action = 'refresh_token_rotated'
  AND a.detail->>'rotatedTokenHash' IS NOT NULL
  AND a.detail->>'sessionId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ORDER BY a.detail->>'rotatedTokenHash', a.id DESC
ON CONFLICT (token_hash) DO NOTHING;

COMMENT ON TABLE refresh_token_history IS
  'SHA-256 hashes of rotated refresh tokens; cascades with session cleanup. Never stores raw tokens.';
