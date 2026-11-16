-- Phase 3: authored asset catalog, character customization, player economy and admin permissions.
-- Additive only. This migration is intentionally not applied by application startup or this PR.

CREATE TABLE world_asset_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  asset_type text NOT NULL CHECK (asset_type IN (
    'character_model', 'character_part', 'clothing', 'accessory',
    'animation', 'cinematic', 'vfx', 'audio', 'environment',
    'npc', 'texture', 'material', 'ui'
  )),
  category text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  storage_key text NOT NULL,
  content_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes > 0),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-fA-F]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'archived')),
  is_current boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(validation_report) = 'object'),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_key, version)
);
CREATE UNIQUE INDEX world_asset_catalog_current_uq
  ON world_asset_catalog (asset_key) WHERE is_current;
CREATE INDEX world_asset_catalog_public_idx
  ON world_asset_catalog (asset_type, category, name)
  WHERE status = 'approved' AND is_current;
CREATE INDEX world_asset_catalog_status_idx
  ON world_asset_catalog (status, created_at DESC);

CREATE TABLE character_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES world_asset_catalog(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('body', 'face', 'hair', 'clothing', 'accessory', 'emote')),
  slot text NOT NULL,
  skeleton_profile text,
  is_starter boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, category, slot)
);
CREATE INDEX character_catalog_items_public_idx
  ON character_catalog_items (category, slot)
  WHERE status = 'approved';

CREATE TABLE character_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  base_model_asset_id uuid NOT NULL REFERENCES world_asset_catalog(id) ON DELETE RESTRICT,
  config jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'archived')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX character_presets_public_idx
  ON character_presets (name) WHERE visibility = 'public' AND status = 'approved';

ALTER TABLE player_characters
  ADD COLUMN preset_id uuid REFERENCES character_presets(id) ON DELETE SET NULL;

CREATE TABLE world_item_prices (
  item_id text NOT NULL REFERENCES world_items(id) ON DELETE CASCADE,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z0-9]{3,8}$'),
  price bigint NOT NULL CHECK (price > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, currency_code)
);
CREATE INDEX world_item_prices_active_idx
  ON world_item_prices (currency_code, item_id) WHERE is_active;

CREATE TABLE player_wallets (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z0-9]{3,8}$'),
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, currency_code)
);

CREATE TABLE economy_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z0-9]{3,8}$'),
  entry_type text NOT NULL CHECK (entry_type IN ('credit', 'debit')),
  amount bigint NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  reference_type text,
  reference_id text,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  balance_after bigint NOT NULL CHECK (balance_after >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency_code, idempotency_key)
);
CREATE INDEX economy_ledger_user_idx
  ON economy_ledger (user_id, currency_code, created_at DESC, id DESC);

CREATE FUNCTION prevent_economy_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'economy_ledger is append-only; create a compensating entry instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER economy_ledger_append_only
  BEFORE UPDATE OR DELETE ON economy_ledger
  FOR EACH ROW EXECUTE FUNCTION prevent_economy_ledger_mutation();

CREATE TABLE admin_permissions (
  permission_key text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_role_permissions (
  role text NOT NULL CHECK (role IN ('player', 'moderator', 'admin')),
  permission_key text NOT NULL REFERENCES admin_permissions(permission_key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission_key)
);

CREATE TABLE admin_user_permission_overrides (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES admin_permissions(permission_key) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);
CREATE INDEX admin_user_permission_overrides_permission_idx
  ON admin_user_permission_overrides (permission_key, effect);

INSERT INTO admin_permissions (permission_key, description) VALUES
  ('assets.read', 'Xem danh mục và phiên bản asset'),
  ('assets.write', 'Tạo và cập nhật metadata asset'),
  ('assets.publish', 'Duyệt, từ chối và phát hành asset'),
  ('characters.manage', 'Quản lý preset và danh mục nhân vật'),
  ('quests.manage', 'Soạn thảo và phát hành quest'),
  ('npcs.manage', 'Soạn thảo NPC, lịch và hội thoại'),
  ('items.manage', 'Quản lý danh mục vật phẩm'),
  ('economy.manage', 'Quản lý giá, ví và bút toán kinh tế'),
  ('moderation.manage', 'Kiểm duyệt người chơi và nội dung'),
  ('communities.manage', 'Quản lý Community và thành viên'),
  ('users.manage', 'Quản lý tài khoản và vai trò'),
  ('audit.read', 'Xem nhật ký kiểm toán'),
  ('permissions.manage', 'Quản lý permission matrix')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO admin_role_permissions (role, permission_key)
SELECT 'admin', permission_key FROM admin_permissions
ON CONFLICT (role, permission_key) DO NOTHING;

INSERT INTO admin_role_permissions (role, permission_key) VALUES
  ('moderator', 'assets.read'),
  ('moderator', 'moderation.manage'),
  ('moderator', 'communities.manage')
ON CONFLICT (role, permission_key) DO NOTHING;
