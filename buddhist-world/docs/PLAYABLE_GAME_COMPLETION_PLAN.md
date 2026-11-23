# Playable Game Completion Plan

**Baseline:** `3ecf10de3d973eed0f705eadbc35e245c9c7d8bf`  
**Target branch:** `feature/phase1-foundation-hardening`  
**Working branch:** `work/playable-game-input-reset-rebased`  
**Policy:** complete asset-independent gameplay first; never treat placeholders as production art.

## Delivery objective

A player can authenticate, enter the temple world, move and look around, interact with world objects and NPCs, follow and complete exploration quests, save progress, leave, and resume without losing authoritative progress. Multiplayer is validated as a separate acceptance track.

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
| P0 Save/resume | Checkpoint and quest progress survive reload and session refresh | Server-backed source exists; end-to-end resume acceptance pending |
| P1 NPC/dialogue | NPC availability follows schedule; dialogue choices persist; NPC-linked quests require proximity | Server-backed source exists; seeded production content and runtime acceptance pending |
| P1 Exploration quests | Accept, progress, complete, reward, journal and HUD refresh are consistent and idempotent | Server source and visual flow test exist; end-to-end DB acceptance pending |
| P2 Meditation/prayer | Session lifecycle, interruption behavior and progress persistence are coherent | Source exists; cross-device/server-authoritative behavior requires further audit |
| P3 Multiplayer | Presence, movement, chat, party and voice reconnect/error states work with multiple real clients | Source exists; multi-client acceptance pending |
| P4 Production readiness | Real character/environment assets, rigged clips, navmesh, LOD, GPU profiling and responsive visual QA pass | Blocked on actual assets and physical/browser QA |

## Asset-independent implementation rules

1. Keep the existing player motion contract and placeholder renderer until a real rigged GLB is available.
2. Keep gameplay anchors, collision and navigation data separate from visual model meshes.
3. Every placeholder is explicitly labelled as temporary; no placeholder is accepted as final art.
4. Prefer deterministic unit/integration tests and browser E2E for logic; do not claim hardware QA from CI.
5. Do not add fake user content, production data, production migrations or deployment steps as part of this plan.

## First implementation increment

The keyboard input lifecycle now clears held movement, sprint and queued actions on browser blur, page hide, and document visibility loss. This prevents a common playable-game defect where returning to a backgrounded tab can leave the avatar moving or sprinting. Automated validation is required before merge.
