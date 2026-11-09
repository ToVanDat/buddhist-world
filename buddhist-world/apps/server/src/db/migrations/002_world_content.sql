-- Phase 2: online world content, NPC dialogue, quests and player inventory.
-- This migration is additive and is NOT run automatically by code changes.
CREATE TABLE world_items (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('consumable','quest','cosmetic','offering')),
  stack_limit integer NOT NULL DEFAULT 99 CHECK (stack_limit > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_inventory (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id text NOT NULL REFERENCES world_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE world_npcs (
  id text PRIMARY KEY,
  region_id text NOT NULL,
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  x real NOT NULL, y real NOT NULL, z real NOT NULL,
  dialogue jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE world_quests (
  id text PRIMARY KEY,
  npc_id text REFERENCES world_npcs(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text NOT NULL,
  objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_repeatable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(objectives) = 'array'),
  CHECK (jsonb_typeof(rewards) = 'array')
);

CREATE TABLE player_quests (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_id text NOT NULL REFERENCES world_quests(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','abandoned')),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (user_id, quest_id),
  CHECK (jsonb_typeof(progress) = 'object')
);
CREATE INDEX player_quests_user_status_idx ON player_quests (user_id, status);
CREATE INDEX world_quests_npc_idx ON world_quests (npc_id) WHERE is_active;

INSERT INTO world_items (id, name, description, category, stack_limit) VALUES
  ('lotus_token', 'Tín vật hoa sen', 'Vật phẩm kỷ niệm hành trình tại quần thể chùa.', 'quest', 99),
  ('incense_bundle', 'Bó hương', 'Vật phẩm biểu trưng cho hoạt động dâng hương.', 'offering', 20),
  ('temple_badge', 'Phù hiệu tham quan', 'Phù hiệu ghi nhận hành trình khám phá.', 'cosmetic', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO world_npcs (id, region_id, name, title, x, y, z, dialogue) VALUES
  ('monk_guide', 'temple_complex', 'Chú tiểu hướng dẫn', 'Người hướng dẫn tham quan', 4, 1.2, -17,
   '[{"id":"welcome","text":"Nam mô A Di Đà Phật. Chào mừng bạn đến thăm chùa."},{"id":"tour","text":"Bạn có thể bắt đầu từ Tam Quan, dạo quanh hồ sen rồi ghé chính điện."}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO world_quests (id, npc_id, title, description, objectives, rewards, is_repeatable) VALUES
  ('first_greeting', 'monk_guide', 'Lời chào đầu tiên', 'Gặp chú tiểu hướng dẫn để bắt đầu hành trình.', '[{"type":"interact","targetId":"monk_guide","count":1,"label":"Trò chuyện với chú tiểu"}]'::jsonb, '[{"itemId":"lotus_token","quantity":1}]'::jsonb, false),
  ('quiet_temple', 'monk_guide', 'Thanh âm tĩnh lặng', 'Thỉnh chuông và dâng hương tại chính điện.', '[{"type":"interact","targetId":"temple_bell","count":1,"label":"Thỉnh chuông"},{"type":"interact","targetId":"incense_burner","count":1,"label":"Dâng hương"}]'::jsonb, '[{"itemId":"incense_bundle","quantity":2},{"itemId":"temple_badge","quantity":1}]'::jsonb, false)
ON CONFLICT (id) DO NOTHING;


-- An offering can only be consumed at its authoritative world interaction point.
UPDATE world_items
   SET metadata = metadata || '{"useTargetId":"incense_burner"}'::jsonb
 WHERE id = 'incense_bundle';
