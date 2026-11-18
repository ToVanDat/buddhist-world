-- Server-authoritative exploration achievements.
CREATE TABLE world_achievements (
  id text PRIMARY KEY CHECK (id ~ '^[a-z0-9_-]{1,64}$'),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL CHECK (category IN ('exploration','mindfulness')),
  icon text NOT NULL DEFAULT '🏵️',
  target_ids text[] NOT NULL CHECK (cardinality(target_ids) > 0),
  required_count integer NOT NULL CHECK (required_count > 0 AND required_count <= cardinality(target_ids)),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_achievements (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL REFERENCES world_achievements(id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);
CREATE INDEX player_achievements_user_unlocked_idx
  ON player_achievements (user_id, unlocked_at DESC);

INSERT INTO world_achievements (id, title, description, category, icon, target_ids, required_count) VALUES
  ('first_conversation', 'Lời chào đầu tiên', 'Bắt đầu hành trình bằng một cuộc trò chuyện với chú tiểu hướng dẫn.', 'exploration', '🪷', ARRAY['monk_guide']::text[], 1),
  ('bell_ringer', 'Tiếng chuông tỉnh thức', 'Thỉnh chuông tại khuôn viên chùa.', 'mindfulness', '🔔', ARRAY['temple_bell']::text[], 1),
  ('quiet_mind', 'Một phút tĩnh tâm', 'Dành một phút chiêm bái trước tượng Phật.', 'mindfulness', '🙏', ARRAY['buddha_statue']::text[], 1),
  ('temple_explorer', 'Người khám phá chốn thiền môn', 'Khám phá chuông chùa, lư hương, tượng Phật và bàn thờ chính điện.', 'exploration', '🧭', ARRAY['temple_bell','incense_burner','buddha_statue','main_altar']::text[], 4)
ON CONFLICT (id) DO NOTHING;
