-- Phase 1/6: chỉ các bảng cần cho đăng nhập, hồ sơ, vị trí an toàn.
-- Các bảng khác (friends, events, inventory...) thêm ở migration riêng khi phase tương ứng bắt đầu.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  username      text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'player' CHECK (role IN ('player','moderator','admin')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email));
CREATE UNIQUE INDEX users_username_uq ON users (lower(username));

CREATE TABLE player_profiles (
  user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_characters (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  base_model text NOT NULL DEFAULT 'avatar_default',
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_locations (
  user_id    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  region_id  text NOT NULL,
  spawn_id   text NOT NULL,
  x real NOT NULL, y real NOT NULL, z real NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Refresh token: chỉ lưu hash. family_id dùng để phát hiện tái sử dụng token cũ.
CREATE TABLE player_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id  uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);
CREATE INDEX player_sessions_user_idx ON player_sessions (user_id);
CREATE INDEX player_sessions_family_idx ON player_sessions (family_id);

CREATE TABLE audit_logs (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip         text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
