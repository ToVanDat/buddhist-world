-- Durable friend requests and block history. Additive only; existing player/game rows are untouched.
CREATE TABLE player_friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CONSTRAINT player_friend_requests_distinct_users CHECK (requester_id <> recipient_id),
  CONSTRAINT player_friend_requests_direction_uq UNIQUE (requester_id, recipient_id)
);

CREATE INDEX player_friend_requests_incoming_idx
  ON player_friend_requests (recipient_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX player_friend_requests_outgoing_idx
  ON player_friend_requests (requester_id, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX player_friend_requests_requester_status_idx
  ON player_friend_requests (requester_id, status, updated_at DESC);
CREATE INDEX player_friend_requests_recipient_status_idx
  ON player_friend_requests (recipient_id, status, updated_at DESC);

-- Keep block/unblock history instead of deleting prior block records.
CREATE TABLE player_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  unblocked_at timestamptz,
  CONSTRAINT player_blocks_distinct_users CHECK (blocker_id <> blocked_id)
);

CREATE UNIQUE INDEX player_blocks_active_pair_uq
  ON player_blocks (blocker_id, blocked_id)
  WHERE unblocked_at IS NULL;
CREATE INDEX player_blocks_blocked_active_idx
  ON player_blocks (blocked_id, blocker_id)
  WHERE unblocked_at IS NULL;
