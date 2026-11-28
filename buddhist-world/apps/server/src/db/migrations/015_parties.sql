-- 012: Temporary player parties and persistent Buddhist World communities.
-- Additive only. Party is for a short shared activity; community is a durable social space.
-- This migration is intentionally not applied automatically to any existing database.

CREATE TABLE player_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  activity_type text NOT NULL
    CHECK (activity_type IN ('meditation', 'dharma_talk', 'ceremony', 'guided_tour', 'world_visit')),
  region_id text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_activity', 'closed')),
  max_members smallint NOT NULL DEFAULT 6 CHECK (max_members BETWEEN 2 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE player_party_members (
  party_id uuid NOT NULL REFERENCES player_parties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (party_id, user_id)
);
CREATE UNIQUE INDEX player_party_one_active_membership_uq
  ON player_party_members (user_id) WHERE left_at IS NULL;
CREATE INDEX player_party_members_active_idx
  ON player_party_members (party_id, joined_at) WHERE left_at IS NULL;
CREATE INDEX player_parties_discovery_idx
  ON player_parties (activity_type, region_id, created_at DESC)
  WHERE status = 'open';

CREATE TABLE player_party_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  party_id uuid NOT NULL REFERENCES player_parties(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  CHECK (inviter_id <> invitee_id)
);
CREATE UNIQUE INDEX player_party_invites_pending_pair_uq
  ON player_party_invites (party_id, invitee_id) WHERE status = 'pending';
CREATE INDEX player_party_invites_inbox_idx
  ON player_party_invites (invitee_id, created_at DESC) WHERE status = 'pending';
