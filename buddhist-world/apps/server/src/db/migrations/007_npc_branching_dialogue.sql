-- Persist per-player branching dialogue progress and authored NPC conversation graphs.
ALTER TABLE world_npcs
  ADD COLUMN dialogue_graph jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE world_npcs
  ADD CONSTRAINT world_npcs_dialogue_graph_is_object
  CHECK (jsonb_typeof(dialogue_graph) = 'object');

CREATE TABLE player_npc_dialogue_state (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  npc_id text NOT NULL REFERENCES world_npcs(id) ON DELETE CASCADE,
  current_node_id text NOT NULL,
  flags jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(flags) = 'object'),
  unlocked_quest_ids text[] NOT NULL DEFAULT '{}',
  choice_history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(choice_history) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, npc_id)
);
CREATE INDEX player_npc_dialogue_updated_idx
  ON player_npc_dialogue_state (user_id, updated_at DESC);

UPDATE world_npcs
   SET dialogue_graph = '{
     "startNodeId": "welcome",
     "nodes": [
       {"id":"welcome","text":"Nam mô A Di Đà Phật. Bạn muốn tìm hiểu điều gì trong khuôn viên chùa?","choices":[
         {"id":"ask_tour","label":"Xin chỉ đường tham quan","nextNodeId":"tour","unlockQuestIds":["first_greeting"],"setFlag":"askedTour"},
         {"id":"ask_practice","label":"Tìm hiểu các nghi thức tại chùa","nextNodeId":"practice","unlockQuestIds":["quiet_temple"],"setFlag":"askedPractice"}
       ]},
       {"id":"tour","text":"Bạn có thể bắt đầu từ Tam Quan, dạo quanh hồ sen rồi ghé chính điện. Hãy thong thả quan sát và giữ không gian thanh tịnh nhé.","choices":[
         {"id":"accept_tour","label":"Tôi sẽ bắt đầu hành trình","nextNodeId":"tour_end","setFlag":"tourAccepted"},
         {"id":"also_practice","label":"Tôi muốn tìm hiểu nghi thức nữa","nextNodeId":"practice","unlockQuestIds":["quiet_temple"],"setFlag":"askedPractice"}
       ]},
       {"id":"practice","text":"Trong chùa, bạn có thể thỉnh chuông, dâng hương và dành một phút tĩnh tâm. Hãy thực hiện với sự thành kính và chậm rãi.","choices":[
         {"id":"learn_bell","label":"Tôi muốn bắt đầu bằng tiếng chuông","nextNodeId":"bell_guide","unlockQuestIds":["quiet_temple"],"setFlag":"bellGuidance"},
         {"id":"return_tour","label":"Quay lại lộ trình tham quan","nextNodeId":"tour","unlockQuestIds":["first_greeting"]}
       ]},
       {"id":"bell_guide","text":"Bạn hãy đến gần chuông chùa ở sân trong và chọn tương tác. Sau đó có thể ghé lư hương và chính điện.","choices":[]},
       {"id":"tour_end","text":"Chúc bạn có một hành trình an lành. Khi cần hướng dẫn, cứ quay lại trò chuyện với tôi nhé.","choices":[]}
     ]
   }'::jsonb
 WHERE id = 'monk_guide';
