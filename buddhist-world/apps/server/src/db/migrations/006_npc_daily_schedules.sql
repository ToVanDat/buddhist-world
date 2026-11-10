-- Add persisted daily NPC schedules. Feature code never runs migrations automatically.
ALTER TABLE world_npcs
  ADD COLUMN schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE world_npcs
  ADD CONSTRAINT world_npcs_schedule_is_array
  CHECK (jsonb_typeof(schedule) = 'array');

UPDATE world_npcs
   SET schedule = '[
     {"id":"morning-prayer","startMinute":300,"endMinute":420,"regionId":"temple_complex","position":[0,1.2,-27],"heading":3.141592653589793,"activity":"pray","dialogueId":"morning"},
     {"id":"day-guide","startMinute":420,"endMinute":1020,"regionId":"temple_complex","position":[8,1.2,-17],"path":[[8,1.2,-17],[6,1.2,-12],[1,1.2,-9],[-4,1.2,-12],[-8,1.2,-17],[-4,1.2,-21],[1,1.2,-22],[6,1.2,-20],[8,1.2,-17]],"speedMps":0.7,"heading":1.5707963267948966,"activity":"walk","dialogueId":"welcome"},
     {"id":"evening-walk","startMinute":1020,"endMinute":1260,"regionId":"temple_complex","position":[0,1.2,0],"path":[[0,1.2,0],[3,1.2,3],[7,1.2,2],[7,1.2,-2],[3,1.2,-4],[0,1.2,0]],"speedMps":0.55,"heading":0,"activity":"walk","dialogueId":"evening"},
     {"id":"night-rest","startMinute":1260,"endMinute":300,"regionId":"temple_complex","position":[-8,1.2,-34],"heading":0,"activity":"rest","dialogueId":"night"}
   ]'::jsonb
 WHERE id = 'monk_guide';
