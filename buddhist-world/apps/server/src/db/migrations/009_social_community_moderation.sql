-- Additive social, party, community event and moderation workflow foundation.
-- Intentionally not applied by source changes; deploy only after backup and approval.
CREATE TABLE friend_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (requester_id <> recipient_id), UNIQUE (requester_id, recipient_id)
);
CREATE INDEX friend_requests_recipient_pending_idx ON friend_requests (recipient_id, created_at DESC) WHERE status='pending';
CREATE TABLE friendships (
 user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_low_id,user_high_id), CHECK (user_low_id < user_high_id)
);
CREATE INDEX friendships_high_user_idx ON friendships (user_high_id,user_low_id);
CREATE TABLE user_blocks (
 blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (blocker_id,blocked_id), CHECK (blocker_id <> blocked_id)
);
CREATE INDEX user_blocks_blocked_idx ON user_blocks (blocked_id,blocker_id);
CREATE TABLE parties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 leader_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 region_id text NOT NULL, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE INDEX parties_active_region_idx ON parties (region_id,created_at DESC) WHERE status='active';
CREATE TABLE party_members (
 party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role text NOT NULL DEFAULT 'member' CHECK (role IN ('leader','member')),
 joined_at timestamptz NOT NULL DEFAULT now(), left_at timestamptz,
 PRIMARY KEY (party_id,user_id)
);
CREATE UNIQUE INDEX party_members_one_active_party_per_user_idx ON party_members(user_id) WHERE left_at IS NULL;
CREATE INDEX party_members_active_party_idx ON party_members(party_id,joined_at) WHERE left_at IS NULL;
CREATE TABLE party_messages (
 id bigserial PRIMARY KEY, party_id uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 body varchar(1200) NOT NULL CHECK (length(btrim(body)) > 0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX party_messages_recent_idx ON party_messages(party_id,id DESC);
CREATE TABLE community_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 host_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title varchar(160) NOT NULL CHECK (length(btrim(title)) > 0),
 description varchar(2000) NOT NULL DEFAULT '', region_id text NOT NULL,
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 capacity integer NOT NULL DEFAULT 32 CHECK (capacity BETWEEN 2 AND 500),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ends_at > starts_at)
);
CREATE INDEX community_events_published_start_idx ON community_events(starts_at,id) WHERE status='published';
CREATE TABLE community_event_members (
 event_id uuid NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_id,user_id)
);
CREATE INDEX community_event_members_user_idx ON community_event_members(user_id,joined_at DESC);
CREATE TABLE moderation_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 target_type text NOT NULL CHECK (target_type IN ('user','party','event','message')),
 target_id text NOT NULL CHECK (length(target_id) BETWEEN 1 AND 128),
 target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 reason varchar(200) NOT NULL CHECK (length(btrim(reason)) > 0),
 details varchar(2000) NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
 assigned_to uuid REFERENCES users(id) ON DELETE SET NULL, resolution varchar(2000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (target_user_id IS NULL OR target_user_id <> reporter_id),

);
CREATE INDEX moderation_reports_queue_idx ON moderation_reports(status,created_at) WHERE status IN ('open','reviewing');
CREATE TABLE moderation_report_events (
 id bigserial PRIMARY KEY, report_id uuid NOT NULL REFERENCES moderation_reports(id) ON DELETE CASCADE,
 actor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK (action IN ('created','reviewing','resolved','dismissed')),
 note varchar(2000) NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_report_events_report_idx ON moderation_report_events(report_id,id DESC);
