-- 014: Persistent Buddhist World communities.
-- Additive only. This migration is intentionally not applied automatically.

CREATE TABLE community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  purpose text NOT NULL
    CHECK (purpose IN ('meditation', 'dharma_learning', 'temple_volunteering', 'regional_community', 'general')),
  visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX community_groups_discovery_idx
  ON community_groups (purpose, created_at DESC) WHERE visibility = 'public' AND status = 'active';

CREATE TABLE community_group_members (
  group_id uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'moderator', 'member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'left', 'removed', 'banned')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX community_group_members_user_idx
  ON community_group_members (user_id, updated_at DESC) WHERE status = 'active';
CREATE INDEX community_group_members_active_idx
  ON community_group_members (group_id, role, joined_at) WHERE status = 'active';

CREATE TABLE community_group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX community_group_join_requests_pending_uq
  ON community_group_join_requests (group_id, user_id) WHERE status = 'pending';
CREATE INDEX community_group_join_requests_review_idx
  ON community_group_join_requests (group_id, created_at) WHERE status = 'pending';
