# Buddhist World — Animation System

Status: Phase 1 foundation. Production character/prop GLBs and in-game visual acceptance are separate gates.

## Principles
- Use authored skeletal clips for player/NPC body language and contact actions.
- Use Blender Python-generated Actions for simple mechanical props (bell, door, lantern, lotus).
- Use React Three Fiber / Three.js at runtime. Blender is an authoring/export tool, not the game runtime.
- Animation events are presentation cues only. The server remains authoritative for interaction validation, quest progress, inventory and rewards.
- Prefer reusable clips and timelines over bespoke clips for every object instance.

## Runtime layers
1. Locomotion: idle, walk, run, jump.
2. Action state: bow, kneel, meditate, ring bell, light incense, offer, pick up, place, open door.
3. Clip resolver: exact aliases from the shared contract; visual fallback must not claim an authored action exists.
4. Event timeline: HandContact, PropImpact, SmokeStart, AttachmentRelease, InteractionFinished.
5. Prop animation: procedural or exported transform clips triggered by a validated server response.
6. NPC activity: schedule selects idle/walk/talk/pray/work/rest.
7. Presentation: audio/VFX respond to cues; they never award gameplay progress.

## Naming
Use the convention AN_Actor_Action_Variant, e.g. AN_Player_Bow, AN_Player_RingBell, AN_Monk_Pray, AN_Prop_Bell_Swing.
Keep locomotion in-place unless movement explicitly owns root motion. Avoid bone-scale keys. Character rig requires a stable root bone.

## Sidecar event manifest
Use versioned JSON rather than relying on Blender markers surviving every exporter version. Example structure:
- schemaVersion: 1
- asset: player_monk
- clips: AN_Player_RingBell
- events: hand-contact at 0.42 seconds (HandContact), interaction-finished at 1.1 seconds (InteractionFinished)

Times are seconds from clip start and must not exceed clip duration. Consumers must be idempotent and scoped to the active interaction request ID.

## Interaction lifecycle
1. Client requests an interaction using the existing API.
2. Server validates owner, region, range, cooldown and target state.
3. Only after acceptance does the client enter the action state.
4. Timeline events trigger presentation (hand contact, sound, smoke, prop motion).
5. Server response/event remains authoritative for durable quest/reward progress.
6. Rejection, timeout, region switch or actor despawn cancels the local action.

Never trigger rewards, inventory grants, quest completion or durable achievements from a client animation marker.

## Blender prop Action helper
The additive helper blender/scripts/generate_prop_animation.py creates transform Actions for an existing object. Supported kinds: bell, lantern, door, lotus. It does not replace final rigging, pivot placement, polish or visual review.

Example command:
blender -b blender/projects/temple_complex.blend --python blender/scripts/generate_prop_animation.py -- --object prop_bell_body --kind bell

Export the containing EXPORT_asset_id collection using the existing blender/scripts/batch_export.py, then validate with pnpm validate:glb -- path-to-file.glb. Blender execution and exported GLB inspection are mandatory; TypeScript CI does not execute Blender.

## Integration contract
- Character GLB: skinned mesh, root joint, direct required clips, non-empty tracks.
- Prop GLB: stable origin/pivot and named transform Action.
- Keep visual and collision meshes separate.
- Register model URL through existing asset/region manifests; avoid per-instance hardcoded URLs.
- Use a sidecar event manifest with a stable semantic vocabulary.
- Test local actor, remote actor and simultaneous prop interactions before multiplayer acceptance.

## Performance
Reuse GLB cache leases. Clamp frame delta after tab suspension. Reduce secondary idle/prop motion on LOW/MOBILE tiers. Avoid per-frame allocations in useFrame.
