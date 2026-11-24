# Playable Game Completion Plan

**Baseline:** `7f68e0d77e24cc8dc9d2ec2d785784124d46f529`  
**Target branch:** `feature/phase1-foundation-hardening`  
**Working branch:** `docs/exploration-first-gameplay-acceptance`  
**Policy:** complete asset-independent gameplay first; never treat placeholders as production art.

## Delivery objective

A player can authenticate, enter the temple world, freely explore the temple and surrounding grounds, discover points of interest, interact with NPCs for cultural and Buddhist information, save progress, leave, and resume without losing authoritative progress. Meditation, chanting, ceremonies, and guided tours are optional activities. There is no compulsory quest treadmill, grind loop, or reward pressure. Multiplayer is validated as a separate acceptance track.

## Current source-backed foundation

- React Three Fiber + Rapier scene, player rigid body, keyboard/touch movement, orbit camera and camera obstruction handling.
- Procedural temple blockout and environmental lighting/water/vegetation systems.
- Server-backed checkpoint, world interaction, NPC schedule/dialogue, quest progress, inventory rewards and achievements modules.
- HUD, onboarding, journal, map, meditation/prayer panels, quest tracker, chat/party/voice surfaces.
- Socket.IO player presence and remote player rendering.

These are source-level findings, not proof that every flow has passed a real browser session or physical-device test.

## Phase acceptance matrix

| Track | Required acceptance | Evidence/status |
|---|---|---|
| P0 Boot & control | App mounts; WebGL fallback is understandable; keyboard and touch movement work; camera remains controllable; interruption does not leave movement stuck | Source exists. This change hardens interruption cleanup; unit regression tests added; CI validation pending |
| P0 World collision | Player stands on walkable surfaces, cannot pass solid architecture, and cannot fall indefinitely outside playable bounds | Rapier source exists; browser gameplay verification pending |
| P0 Interaction | Nearby target prompt is correct; one input causes one server-validated interaction; errors can be retried | Source and tests exist; full runtime pass pending |
| P0 Save/resume | Last valid region, checkpoint, position and facing restore safely after reconnect/relogin; stale, out-of-bounds or invalid saved locations fall back to a valid spawn | `/api/me` reads `player_locations`; checkpoint writes require fresh server presence and proximity; realtime gateway persists location with owner-epoch fencing; end-to-end resume acceptance pending |
| P1 NPC/dialogue | NPC availability follows schedule; dialogue choices persist; NPC-linked quests require proximity | Server-backed source exists; seeded production content and runtime acceptance pending |
| P1 Points of interest | Discoverable places explain temple architecture, history, practice and local context; interaction is optional and repeat-safe | Interaction definitions and proximity checks exist; content completeness and end-to-end acceptance pending |
| P2 Optional activities | Meditation, chanting, ceremonies and guided tours can be started or left freely; progress is private where appropriate and never grants coercive gameplay rewards | Prayer progress API and party activity types exist; session lifecycle, interruption and cross-device acceptance require audit |
| P3 Multiplayer | Presence, movement, chat, party and voice reconnect/error states work with multiple real clients | Source exists; multi-client acceptance pending |
| P4 Production readiness | Real character/environment assets, rigged clips, navmesh, LOD, GPU profiling and responsive visual QA pass | Blocked on actual assets and physical/browser QA |

## Exploration-first experience rules

1. The temple is a place to explore and learn, not an RPG grind map.
2. Quests, if retained, are optional guidance and must never gate access to regions, NPCs, knowledge, meditation, or social activities.
3. Do not award power, combat stats, or progression advantages for religious practice. Prayer progress is private practice data, not a competitive score.
4. NPC dialogue should prioritize respectful, accurate cultural and Buddhist context; avoid fabricated scripture, claims, or religious authority.
5. Guided tours are opt-in group activities. A player can leave without penalty.

## Asset-independent implementation rules

1. Keep the existing player motion contract and placeholder renderer until a real rigged GLB is available.
2. Keep gameplay anchors, collision and navigation data separate from visual model meshes.
3. Every placeholder is explicitly labelled as temporary; no placeholder is accepted as final art.
4. Prefer deterministic unit/integration tests and browser E2E for logic; do not claim hardware QA from CI.
5. Do not add fake user content, production data, production migrations or deployment steps as part of this plan.

## First implementation increment

The keyboard input lifecycle now clears held movement, sprint and queued actions on browser blur, page hide, and document visibility loss. This prevents a common playable-game defect where returning to a backgrounded tab can leave the avatar moving or sprinting. Automated validation is required before merge.
