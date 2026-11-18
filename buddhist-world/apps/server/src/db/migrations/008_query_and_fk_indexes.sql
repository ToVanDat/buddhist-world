-- Phase 1 P0: add indexes for verified backend access paths and FK child columns.
-- Additive only: no rows are updated or deleted, and no constraints are changed.
-- The migration runner wraps this file in a transaction, so do not use CONCURRENTLY.

-- FK child columns not covered by the leading columns of an existing index.
CREATE INDEX IF NOT EXISTS player_inventory_item_id_idx
  ON player_inventory (item_id);

CREATE INDEX IF NOT EXISTS player_quests_quest_id_idx
  ON player_quests (quest_id);

CREATE INDEX IF NOT EXISTS player_npc_dialogue_state_npc_id_idx
  ON player_npc_dialogue_state (npc_id);

CREATE INDEX IF NOT EXISTS player_achievements_achievement_id_idx
  ON player_achievements (achievement_id);

-- Backend NPC list and gateway refresh:
-- WHERE region_id = ? AND is_active = true ORDER BY id
-- and WHERE is_active = true ORDER BY region_id, id.
CREATE INDEX IF NOT EXISTS world_npcs_active_region_id_idx
  ON world_npcs (region_id, id)
  WHERE is_active = true;

-- Backend active quest catalogue:
-- WHERE is_active = true ORDER BY created_at, id.
CREATE INDEX IF NOT EXISTS world_quests_active_created_idx
  ON world_quests (created_at, id)
  WHERE is_active = true;

-- Achievement progress:
-- WHERE actor_user_id = ? AND target_id = ANY(?).
CREATE INDEX IF NOT EXISTS world_events_actor_target_idx
  ON world_events (actor_user_id, target_id)
  WHERE actor_user_id IS NOT NULL;
