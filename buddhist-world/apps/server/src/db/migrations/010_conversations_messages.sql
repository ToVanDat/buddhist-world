-- Durable direct and group conversations. Messages are soft-deletable and receipts are per recipient.
CREATE TABLE player_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('direct', 'group')),
  direct_key text UNIQUE,
  title text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_conversations_kind_fields CHECK (
    (kind = 'direct' AND direct_key IS NOT NULL AND title IS NULL)
    OR (kind = 'group' AND direct_key IS NULL AND title IS NOT NULL)
  )
);

CREATE TABLE player_conversation_members (
  conversation_id uuid NOT NULL REFERENCES player_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  last_read_at timestamptz,
  muted_until timestamptz,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX player_conversation_members_user_idx
  ON player_conversation_members (user_id, left_at, conversation_id);
CREATE INDEX player_conversation_members_conversation_idx
  ON player_conversation_members (conversation_id, joined_at)
  WHERE left_at IS NULL;

CREATE TABLE player_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES player_conversations(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES users(id) ON DELETE SET NULL,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'system')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  client_message_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX player_messages_sender_client_id_uq
  ON player_messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE INDEX player_messages_conversation_created_idx
  ON player_messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX player_messages_sender_created_idx
  ON player_messages (sender_id, created_at DESC)
  WHERE sender_id IS NOT NULL;

CREATE TABLE player_message_receipts (
  message_id uuid NOT NULL REFERENCES player_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at timestamptz,
  read_at timestamptz,
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX player_message_receipts_user_unread_idx
  ON player_message_receipts (user_id, message_id)
  WHERE read_at IS NULL;
