# Animation System — Acceptance Criteria

Scope: Player + NPC + interactive objects + environment. Method: Blender-authored clips + Blender Python Actions + Three.js runtime. Criteria are gates, not claims of completion.

| ID | Priority | Acceptance criteria | Evidence |
|---|---|---|---|
| ANM-01 | P0 | Shared contract defines locomotion and action clips with stable aliases | Contract tests + sample player GLB |
| ANM-02 | P0 | Idle/Walk/Run/Jump transitions are smooth | Mixer tests + desktop/mobile captures |
| ANM-03 | P0 | Player action state supports Bow, Kneel, Meditate, RingBell, LightIncense, Offer, PickUp, Place, OpenDoor | State tests + rigged GLB |
| ANM-04 | P0 | Action clips are non-looping by default, cancellable and return to locomotion | Unit + runtime tests |
| ANM-05 | P0 | Actions start only after server acceptance; rejection/timeout/region switch cancels them | API integration + client E2E |
| ANM-06 | P0 | Timeline events fire once per crossed event and are scoped to interaction request ID | Timeline tests + replay/race test |
| ANM-07 | P0 | Events trigger presentation only, never rewards or quest progress | Security review + negative integration test |
| ANM-08 | P1 | Hand/item sockets align and release at the correct event | Rig validation + visual QA |
| ANM-09 | P1 | Bell, door, lantern and lotus have reusable Actions/procedural equivalents | Blender run + GLB clip validation |
| ANM-10 | P1 | NPC schedule selects authored idle/walk/talk/pray/work/rest clips with deterministic fallback | Schedule tests + NPC GLB |
| ANM-11 | P1 | Environment motion respects quality tiers and visibility | GPU/mobile profiling |
| ANM-12 | P1 | Remote players show action state without trusting client gameplay outcomes | Two-client/two-gateway E2E |
| ANM-13 | P1 | Character/prop GLBs meet naming, skeleton, clip, PBR and budget policies | Strict GLB validation report |
| ANM-14 | P1 | Blender Action helper is deterministic and fails on missing objects | Blender background tests |
| ANM-15 | P1 | Animation budget is met on desktop/tablet/mobile | FPS/p95 frame-time report |
| ANM-16 | P2 | Reduced-motion suppresses nonessential idle/camera/ambient motion | Settings tests + captures |

## Evidence at phase start
- Existing GLBAvatar uses Three.js AnimationMixer, alias matching and fallback.
- NPC schedule states and procedural placeholder motion already exist.
- Bell proxy has a short procedural swing; incense uses the particle emitter.
- Blender validator currently checks Idle/Walk/Run/Jump; batch exporter supports character animation/NLA.
- Added in this phase: deterministic clip-local event-window helper + tests; Blender prop Action helper; architecture and acceptance docs.

## Not yet accepted
- No production player or monk GLB was verified in the branch during audit.
- Blender runtime execution and GLB export have not been run in this session.
- Player action-state integration, hand IK/attachment, accepted-interaction lifecycle, remote action replication and visual QA remain open.
- Do not mark accepted until ANM-01 through ANM-07 pass with real asset/runtime evidence.
