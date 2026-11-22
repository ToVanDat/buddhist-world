# Buddhist World — Realism Master Upgrade Matrix

**Audit date:** 2026-11-22  
**Branch baseline:** feature/phase1-foundation-hardening at 80b237286d1322395c94117cfbeaae6356a5b080  
**Target slice:** Tam Quan → courtyard → Main Hall → Bodhi Garden  
**Direction:** Cinematic realistic Vietnamese Buddhist temple; hybrid Blender-authored assets + deterministic procedural/R3F runtime  
**Evidence mode:** Git source and existing project documentation. No local Windows browser, Blender process, physical GPU, or target mobile device was executed for this matrix.

> This matrix is an execution and acceptance contract. Source presence, tests, procedural geometry, or a green CI job do not prove realistic visual quality. No item is REALISM_ACCEPTED without its required evidence.

## 1. Production art brief

See [REALISM_ART_ASSET_PRODUCTION_BRIEF_2026-11-22.md](./REALISM_ART_ASSET_PRODUCTION_BRIEF_2026-11-22.md) for Blender-ready monk, temple module, PBR, animation, collision/navmesh, lighting and audio handoff requirements. This is a specification, not evidence of completed assets.

## 2. Five-level realism scale

| Level | Meaning | Evidence required |
|---|---|---|
| PLACEHOLDER | Proxy geometry, fallback avatar, empty asset slot, or visual stand-in | Explicit placeholder label and replacement brief |
| FUNCTIONAL | The interaction/system works in source/runtime, but visual or physical fidelity is limited | Unit/integration tests and runtime behavior |
| ANIMATED | Authored or procedural animation is wired and responds to state/events | Clip/state tests and captured animation review |
| PHYSICALLY_GROUNDED | Scale, collision, contact, timing, material response, spatial audio, and interaction are coherent | Geometry/physics/audio inspection and repeatable runtime test |
| REALISM_ACCEPTED | Final art and runtime result satisfy the approved art bible and target-device quality gates | Approved source assets, GLB/PBR reports, browser captures, GPU/device metrics, and reviewer sign-off |

A system can contain a functional foundation while its final asset remains a placeholder. Track those separately; never promote the whole feature based on its best subcomponent.

## 3. Current source-audit matrix

| ID | System | Current level | Priority | Evidence / remaining gap |
|---|---|---|---|---|
| RLM-01 | Player locomotion | FUNCTIONAL | P0 | Rapier capsule, walk/run/jump, yaw smoothing and camera obstruction exist. This branch adds bounded acceleration/braking and a tested pure velocity resolver. Needs in-browser tuning, foot-contact review, slope/stair tests and server reconciliation review. |
| RLM-02 | Hero monk appearance | PLACEHOLDER | P0 | Player falls back to PlaceholderAvatar unless VITE_PLAYER_MODEL_URL points to a real model. No committed, accepted monk GLB/rig/material set is evidenced. |
| RLM-03 | Character animation runtime | FUNCTIONAL | P0 | GLB AnimationMixer, clip aliases, cross-fade and fallback resolver exist. No accepted monk GLB with the required locomotion/action clips. |
| RLM-04 | Monk action animation | PLACEHOLDER | P0 | Shared contract names actions such as pray/kneel/bow, but authored clips, hand/item sockets, IK and action lifecycle still require a real rig and acceptance. |
| RLM-05 | Temple architecture | PLACEHOLDER | P0 | Procedural/blockout region and geometry details exist; region asset manifest is empty in the audited baseline. Production Tam Quan/Main Hall modules and culturally reviewed ornament are missing. |
| RLM-06 | PBR surface library | FUNCTIONAL | P0 | Procedural material generation and strict GLB/PBR validators exist. No accepted authored Base Color, Metallic-Roughness, Normal and Occlusion payload set is evidenced. |
| RLM-07 | Collision and walkable navmesh | PLACEHOLDER | P0 | Runtime/validator tooling exists. Empty-folder-tolerant validator success is not authored collision/navmesh acceptance. Must match final architecture geometry. |
| RLM-08 | World interactions | FUNCTIONAL | P0 | Server-mediated interaction paths and world cues exist. Real hand contact, action clips, prop states, persistent visual state and multiplayer presentation need end-to-end validation. |
| RLM-09 | World lighting and weather | FUNCTIONAL | P1 | Day profiles, weather interpolation, sky/fog, rain and quality gates exist. Exposure, shadow quality, reflections and cinematic composition remain visually unaccepted. |
| RLM-10 | Vegetation and wind | ANIMATED | P1 | Instanced vegetation, LOD, procedural wind and quality scaling exist. Species silhouettes, authored assets, biome placement, culling and physical-device profiling remain open. |
| RLM-11 | Water and pond | ANIMATED | P1 | Animated pond/rain/waterfall effects exist; pond waves, waterfall sheet deflection, impact foam and airborne mist now consume the shared deterministic wind-field contract. Depth-aware shoreline/absorption, coherent reflections/refraction and measured overdraw need review. |
| RLM-12 | Particles and incense | ANIMATED | P1 | Instanced incense smoke and waterfall mist, quality budgets and lifecycle hardening exist; both now consume the shared wind field. Need authored smoke/ember appearance, material depth integration and visual/device QA. |
| RLM-13 | Spatial audio | FUNCTIONAL | P1 | Web Audio panner and synthesized interaction cues exist. Synthesized bell is explicitly an approximation; no approved field recordings or complete audio-zone mix are evidenced. |
| RLM-14 | NPC life and schedule | FUNCTIONAL | P1 | NPC schedule/state and actor rendering foundations exist. Real monk models, activity clips, pathing, schedule variation and context reactions remain open. |
| RLM-15 | UI/HUD/Journal | FUNCTIONAL | P1 | Main menu, HUD, panels, meditation and prayer UI exist. Need in-world diegetic interaction prompts, consistent transitions and visual/accessibility acceptance across devices. |
| RLM-16 | Multiplayer presence/actions | FUNCTIONAL | P1 | Realtime presence/chat/voice and interaction paths exist. Two-client action animation, state consistency and TURN-backed voice need real test evidence. |
| RLM-17 | Performance and streaming | FUNCTIONAL | P0 | Quality profiles, LOD, instancing, adaptive monitor and telemetry exist. Current LOD loading is not equivalent to full network/memory streaming. Physical GPU and device baselines remain missing. |
| RLM-18 | Production art pipeline | FUNCTIONAL | P0 | Blender generation/export, GLB/PBR/rig validators and asset audit tools exist. No accepted final art payloads; Blender runtime export and review remain required. |

## 4. Delivery phases and acceptance gates

### Phase 0 — Integrity and baseline
- [x] Preserve the current architecture; extend existing R3F, Rapier, animation, audio and asset systems instead of rewriting them.
- [x] Establish conservative realism states and evidence requirements in this matrix.
- [x] Add tested acceleration/braking response to player horizontal locomotion.
- [ ] Verify the new movement response in browser at 30/60/120 Hz, with keyboard and touch input.
- [ ] Verify server correction, region spawn, slopes, stairs, collision and action-input blocking are unaffected.

**Exit gate:** typecheck/unit/integration/E2E pass; movement captures show no abrupt velocity snap, excessive drift or foot sliding. Do not claim physical acceptance without browser evidence.

### Phase 1 — Hero monk and movement
- [ ] Author one approved monk hero model in Blender: correct anatomy/proportions, robe layers, clean topology, UVs, PBR materials, skeleton and pivots.
- [ ] Produce Idle, Walk, Run, Start, Stop, Turn, Jump, Bow, Kneel, Sit, Meditate, Pray and interaction clips as separate named Actions.
- [ ] Add hand/item sockets and contact alignment for mala, incense, bell and door.
- [ ] Validate clip names, skeleton, scale, bounds, material slots, texture channels and GLB budget.
- [ ] Replace fallback only after a real GLB passes validation; retain fallback for missing/failed optional assets.

**Exit gate:** real GLB + Blender source + strict validator report + browser animation captures + no foot sliding/visible clipping in the approved route.

### Phase 2 — Temple environment and physical grounding
- [ ] Author Tam Quan, courtyard, Main Hall and Bodhi Garden as modular production assets.
- [ ] Establish material families: aged timber, terracotta roof, limestone, bronze, lacquer, moss, soil, water and foliage.
- [ ] Add authored collision meshes and walkable navmesh derived from the same final geometry.
- [ ] Validate door openings, stairs, thresholds, ramps, altar clearance and accessible walk paths.
- [ ] Add asset registry metadata: stable ID, provenance, source .blend, GLB variant, content hash, LOD, bounds, dependencies, collision/navmesh references, budgets and acceptance state.

**Exit gate:** strict asset and collision/navmesh validators pass with non-empty authored payloads; route walkthrough has no wall penetration, floating, stuck points or mismatched collision.

### Phase 3 — Interaction and animation
- [ ] Drive each action from accepted interaction state; server acceptance precedes presentation.
- [ ] Use animation timeline events for contact points (hand reaches, incense lights, bell strike, item release).
- [ ] Make action clips cancellable and return to locomotion safely.
- [ ] Replicate action state to remote players without trusting client-side rewards or progression.
- [ ] Keep prayer/mala progress self-reported; do not infer chanting or grant rewards automatically.

**Exit gate:** interaction request IDs prevent duplicate event execution; server rejection/timeout/region change cancels the action; two-client tests show consistent action state.

### Phase 4 — Living temple
- [ ] Finish deterministic NPC schedules for prayer, walking, sweeping, gardening, resting and conversation.
- [ ] Add natural idle variation, turns, look-at, path following and contextual reactions.
- [x] Feed vegetation, particles and pond-wave direction from the shared deterministic wind-field contract; visual coherence still needs browser review.
- [ ] Calibrate day/night, rain, fog and interior lighting against the approved reference views.
- [ ] Create spatial audio zones for courtyard, covered walkway, Main Hall and garden; use owned/licensed recordings only.

**Exit gate:** NPC behavior is repeatable and context-aware; environment effects share consistent weather/wind state; audio distance/zone behavior is verified with real speakers/headphones.

### Phase 5 — Cinematic polish and performance
- [ ] Review matched camera views at Tam Quan, courtyard, Main Hall and Bodhi Garden.
- [ ] Test ULTRA/HIGH/MEDIUM/LOW/MOBILE tiers and reduced-motion settings.
- [ ] Measure draw calls, triangles, texture memory, shader cost, load time, frame pacing and context loss.
- [ ] Test desktop/tablet/mobile layouts and keyboard/touch controls.
- [ ] Capture real browser/GPU screenshots and performance reports; keep lighting QA separately gated until explicitly authorized.

**Exit gate:** approved visual baseline, no critical gameplay/UI regression, target hardware performance recorded, and all remaining limitations documented.

## 5. Engineering rules

1. Do not generate fake production assets, fake recordings, fake navmesh or collision payloads to make validators green.
2. Procedural geometry is acceptable for blockout and scalable background detail, not a substitute for hero art.
3. Keep visual mesh, collision mesh and navmesh as separate representations with traceable provenance.
4. Keep animation presentation separate from server-authoritative interaction outcomes.
5. Keep realistic motion quality-tier aware; do not add expensive cloth/physics simulation globally without profiling.
6. Respect reduced motion, audio controls, focus, keyboard, touch and safe-area constraints.
7. No combat, PvP, damage, or combat-power progression is introduced by this realism roadmap.
8. Do not alter production services, production databases, or deployment configuration as part of this work.

## 6. Current branch delivery in this pass

- Added resolveHorizontalVelocity: bounded grounded acceleration/braking and reduced airborne control.
- Integrated velocity shaping into PlayerController; animation state follows actual horizontal speed during deceleration.
- Added unit tests for acceleration, braking, air control, target convergence, frame-delta clamping and direction changes.
- Extended shared wind response to pond waves, waterfall sheet deflection, impact foam and airborne mist; added tests for normalized direction, drift scaling, invalid samples and calm weather.
- Added a Blender-ready production brief for monk/temple assets, PBR materials, animation clips, collision/navmesh, lighting views and licensed audio.
- This is a source-level movement/environment improvement. Browser feel, foot contact, physical-device performance and realistic monk animation remain unaccepted until their evidence is captured.
