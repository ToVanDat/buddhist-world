# D6 — Frontend Implementation Blueprint

- Project: Buddhist World
- Branch: `feature/phase1-foundation-hardening`
- Audited source head: `7f4741ff3afeb62770acf9ced9d572076b8b4ee8`
- Scope: frontend UX/HUD only; no database, migration, world geometry, asset, server protocol, deployment or secret changes.
- Status: implementation plan; source implementation has not started.

## 1. Design direction and reference principles

Use AAA games as design references at the level of interaction principles, not copied assets or proprietary UI.

- Ghost of Tsushima: dynamic minimal HUD, environmental navigation cues, readable contextual prompts.
- Red Dead Redemption 2: contextual interaction and layered menus; avoid reproducing its menu complexity.
- Assassin's Creed Shadows: cinematic transitions and clear separation between exploration and menu modes.
- Black Myth: Wukong: strong hierarchy and decisive action feedback, adapted to a contemplative Buddhist experience.

Buddhist World identity remains Vietnamese Buddhist architecture, natural materials, restrained gold/bamboo accents, cinematic environmental composition and a world-first interface.

## 2. Source baseline findings

### Existing source

- `apps/web/src/app/App.tsx`: auth gate, world connection, GameCanvas and HUD composition.
- `apps/web/src/components/ui/HUD.tsx`: current HUD orchestrator; contains region/network status, quality and camera selectors, profile/journal open state, interaction/checkpoint prompts, NPC dialogue, voice/chat and touch controls.
- `apps/web/src/components/ui/TempleGuide.tsx`: region spawn waypoint selection, distance and relative bearing.
- `apps/web/src/components/ui/NpcDialogue.tsx`: dialogue branches, choices, quest offers, loading/error states, Escape and focus trap.
- `apps/web/src/components/ui/WorldJournal.tsx`: quests, inventory, activity and achievements; loading/error/empty handling; Escape and focus trap.
- `apps/web/src/components/ui/ProfilePanel.tsx`: profile fetch/edit/save; currently lacks the same Escape/focus-trap behavior used by Journal and NPC Dialogue.
- `apps/web/src/components/ui/ChatPanel.tsx`: always-rendered nearby chat panel.
- `apps/web/src/components/ui/VoiceChat.tsx`: WebRTC peer lifecycle, microphone permission, push-to-talk, speaking status and per-peer volume.
- `apps/web/src/components/ui/Joystick.tsx`: touch joystick and jump/run controls writing directly to the mutable game input object.
- `apps/web/src/stores/game.ts`: player position/yaw, waypoint, nearby checkpoint/interaction, NPC dialogue, NPC snapshots and camera mode.
- `apps/web/src/stores/net.ts`: connection state, region, spawn, remote players, chat and notice.
- `apps/web/src/game/core/input.ts`: keyboard, pointer orbit, zoom and mutable movement input.
- `apps/web/src/game/characters/PlayerController.tsx`: player movement, interaction dispatch, checkpoint detection and camera profile application.
- `apps/web/src/game/rendering/cameraModes.ts`: gameplay/cinematic/photo camera profiles.
- `apps/web/src/game/GameCanvas.tsx`: R3F canvas, physics, region content, lighting, weather and quality profile.
- `apps/web/src/styles.css`: existing visual tokens and styles for HUD, chat, voice, profile, journal, interaction and touch controls.

### Verified design/architecture gaps

1. HUD.tsx owns too many unrelated presentation responsibilities.
2. TempleGuide, ChatPanel and VoiceChat currently render independently; no unified social/navigation visibility policy exists.
3. Profile and Journal can be opened from independent booleans; there is no single overlay arbitration rule.
4. ProfilePanel does not implement the same Escape/focus restoration/focus trap pattern found in Journal and NPC Dialogue.
5. Keyboard input ignores typing targets, but there is no general modal/input-blocking contract. Touch controls write directly to the game input object.
6. VoiceChat owns live WebRTC resources. Unmounting it merely to collapse the visual panel would tear down peers, audio and media state.
7. Camera modes change camera framing/FOV/smoothing in PlayerController. This is not evidence of a cinematic timeline, scripted cutscene director or video-intro manager.
8. Current Playwright visual tests cover lighting/performance/GPU-oriented concerns; a complete desktop/mobile gameplay HUD visual regression suite is not present in the audited file list.
9. Existing CSS already contains many useful tokens and components. The implementation should refactor and consolidate rather than replace the whole stylesheet.

## 3. Implementation order and scope

The five user-approved workstreams are the implementation sequence. Each phase must pass its own regression checks before the next begins.

### Phase 1 — Gameplay HUD

**Goal:** make the world the primary visual surface and turn the HUD into a restrained, responsive AAA-inspired layer.

Proposed component boundaries:
- `HUD.tsx`: orchestration only; selects state and composes zones.
- `HudLocation.tsx`: region and connection status.
- `HudPlayerMenu.tsx`: identity/profile and system actions.
- `HudQuickActions.tsx`: journal/social/settings entry points.
- `InteractionPrompt.tsx`: shared prompt presentation, initially fed by existing interaction/checkpoint state.
- `HudNotice.tsx`: connection and action feedback with consistent priority.

Desktop layout:
- top-left: region and compact connection status.
- top-right: identity and quick actions.
- contextual navigation: compact waypoint card, collapsible when not tracking.
- bottom-center: one interaction/checkpoint prompt.
- bottom-left: compact social entry.
- developer performance overlay remains DEV-only and separate from player HUD.

Mobile layout:
- compact top bar with region and profile.
- existing joystick/action controls retain their current input semantics.
- interaction prompt must not overlap joystick, action buttons, checkpoint status or safe-area.
- secondary actions move into a compact drawer.

Files expected to change:
- `apps/web/src/components/ui/HUD.tsx`
- `apps/web/src/styles.css`
- new HUD components under `apps/web/src/components/ui/`
- optionally `apps/web/src/stores/ui.ts` for overlay visibility only; do not move authoritative gameplay state into the UI store.

Constraints:
- Do not change GameCanvas or PlayerController behavior in this phase.
- Keep existing color tokens: ink, stone, bone, bamboo, gold and muted.
- Do not add fake health, stamina, XP or minimap elements; no such gameplay systems were confirmed in the audit.

Acceptance:
- Desktop 1440px and 1280px, tablet 1024px/768px, mobile 390px/360px.
- No HUD collisions at the supported breakpoints.
- World viewport remains visually dominant.
- Existing camera, movement, checkpoint, waypoint, quality and logout actions remain functional.

### Phase 2 — Contextual Interaction

**Goal:** one consistent language for NPCs, world objects, checkpoints, dialogue and server feedback.

Files expected to change:
- `apps/web/src/components/ui/InteractionPrompt.tsx` (new)
- `apps/web/src/components/ui/NpcDialogue.tsx`
- `apps/web/src/components/ui/HUD.tsx`
- `apps/web/src/stores/game.ts` only if a missing presentation state is proven necessary
- `apps/web/src/game/core/input.ts` for a deliberate UI input-lock contract
- `apps/web/src/game/characters/PlayerController.tsx` only if required to honor that contract without changing movement semantics
- relevant interaction tests.

Interaction states:
- unavailable, out-of-range, available, pending, success, failed and cooldown.
- UI state must reflect the existing server/game result; do not synthesize success.
- NPC choices and quest acceptance keep their current API calls and server authority.
- checkpoint save continues to use the existing authenticated API.

Input safety:
- opening a blocking dialog/drawer must clear held movement/sprint/jump/interact state.
- key-up and window-blur cleanup must still run even while input is blocked to avoid stuck keys.
- typing in inputs must never trigger movement.
- touch controls must be disabled or ignored while a blocking overlay owns focus.
- closing an overlay restores gameplay input without requiring a page reload.

Acceptance:
- no movement while a blocking dialog is open.
- no accidental interaction from Enter/Space while typing.
- Escape and explicit close behave consistently.
- pending/error/success states are announced accessibly.

### Phase 3 — Journal / Profile / Social

**Goal:** unify panel, drawer and social behavior without disrupting API or media lifecycles.

Files expected to change:
- `apps/web/src/components/ui/WorldJournal.tsx`
- `apps/web/src/components/ui/ProfilePanel.tsx`
- `apps/web/src/components/ui/ChatPanel.tsx`
- `apps/web/src/components/ui/VoiceChat.tsx`
- `apps/web/src/components/ui/HUD.tsx`
- `apps/web/src/styles.css`
- shared dialog/drawer primitives under `apps/web/src/components/ui/`

Panel rules:
- only one blocking modal at a time.
- use a shared shell for heading, close behavior, backdrop, focus trap, Escape and focus restoration.
- preserve Journal's existing quests, inventory, activity and achievements tabs and all API behavior.
- preserve Profile's existing fetch/update behavior and display-name validation.
- keep clear loading, empty, error, saving and success states.

Social rules:
- create a compact Social Dock with independent Chat and Voice visual expansion.
- keep VoiceChat mounted while collapsed; do not unmount it to hide its panel because its cleanup closes WebRTC peers, stops tracks and closes AudioContext.
- collapsing Chat must not disconnect Socket.IO or clear chat history.
- microphone remains off until explicit user action.
- microphone permission and connection errors remain visible.
- avoid placing voice panel over the top-right identity menu.

Acceptance:
- no duplicate modal overlays.
- keyboard focus returns to the trigger.
- voice peers remain connected when the visual panel collapses.
- chat and voice work at desktop and mobile widths.
- API contracts and persistence remain unchanged.

### Phase 4 — Cinematic Presentation

**Goal:** add premium transitions around the existing camera modes without pretending a full cutscene system exists.

Files expected to change:
- `apps/web/src/components/ui/HUD.tsx`
- new `CinematicPresentation.tsx` / `CameraModeControl.tsx` if justified
- `apps/web/src/styles.css`
- `apps/web/src/game/rendering/cameraModes.ts` only for measured profile refinements
- `apps/web/src/game/characters/PlayerController.tsx` only if a tested camera transition contract is needed.

Behavior:
- Gameplay: full navigation and contextual HUD.
- Cinematic: suppress secondary HUD, retain essential accessibility/exit affordance, optional subtle letterbox/title reveal.
- Photo: preserve existing framing profile and avoid gameplay UI clutter.
- use CSS transitions first; Framer Motion is already a dependency but should not be added or used without a specific benefit.
- respect prefers-reduced-motion.
- do not add scripted camera rails, video intro playback, timeline editor or scene sequence data until content and camera ownership are designed.

Acceptance:
- switching modes does not remount Canvas or PlayerController.
- no camera snapping or loss of orbit state.
- obstruction raycast remains effective.
- reduced-motion behavior is verified.
- no continuous expensive blur/animation on the 3D viewport.

### Phase 5 — World Map / Meditation (gated)

**Goal:** design and implement only after world data and gameplay contracts are confirmed.

World Map prerequisites:
- authoritative region/area metadata and stable IDs.
- discovered/undiscovered state and permissions.
- waypoint destination validity and persistence rules.
- route/path availability and navigation behavior.
- mobile map interaction and data-loading behavior.

Meditation prerequisites:
- actual session model and lifecycle.
- supported environment/scene selection.
- audio/ambience availability and licensing.
- pause/resume/end behavior and persistence expectations.
- reduced-motion and accessibility behavior.

Do not build placeholder map markers, fake discoveries, fabricated session timers or unsupported rewards. If prerequisites are absent, keep these items as design-only and report the blockers.

## 4. Shared implementation architecture

Recommended UI-only state:
- one active blocking overlay identifier, e.g. `null | "journal" | "profile" | "settings" | "npc-dialogue"`.
- independent expanded/collapsed state for non-blocking HUD sections.
- no copies of server-owned player, quest, region, checkpoint or voice state.
- authoritative state remains in existing auth/net/game stores and APIs.

Avoid broad selectors that subscribe the whole HUD to high-frequency player position updates. Use narrow Zustand selectors and keep camera/game-loop state outside React UI rendering where it currently belongs.

Do not unmount resource-owning components such as VoiceChat simply to hide their presentation.

No new package is required for the planned first four phases.

## 5. Test and visual QA plan

Existing relevant tests:
- `apps/web/src/game/rendering/cameraModes.test.ts`
- `apps/web/src/game/interactions/checkpoints.test.ts`
- `apps/web/src/game/interactions/waypoints.test.ts`
- `apps/web/src/game/interactions/worldInteractions.test.ts`
- `apps/web/src/components/ui/journalModel.test.ts`
- Playwright visual tests for lighting, performance and GPU.

Add:
- UI state/overlay arbitration unit tests.
- interaction prompt state tests.
- input lock and release/blur tests.
- dialog focus, Escape and focus restoration tests.
- VoiceChat collapse lifecycle test (component stays mounted).
- desktop/mobile HUD screenshot tests.
- reduced-motion and keyboard-only checks.

The current Playwright browser configuration uses SwiftShader. It can validate layout and interaction but must not be treated as physical-GPU performance evidence. Run visual QA at desktop and mobile viewports; separately benchmark on real hardware.

Required commands from the workspace root:
- `pnpm --filter @bw/web typecheck`
- `pnpm --filter @bw/web test`
- `pnpm --filter @bw/web build`
- `pnpm --filter @bw/web test:visual`

Run broader workspace checks only when the change touches shared packages or server contracts.

## 6. File change matrix

| Workstream | Existing files | New files (proposed) |
|---|---|---|
| Gameplay HUD | HUD.tsx, styles.css | HudLocation.tsx, HudPlayerMenu.tsx, HudQuickActions.tsx, HudNotice.tsx |
| Interaction | HUD.tsx, NpcDialogue.tsx, game.ts, input.ts, PlayerController.tsx | InteractionPrompt.tsx, UI input-lock tests |
| Journal/Profile/Social | WorldJournal.tsx, ProfilePanel.tsx, ChatPanel.tsx, VoiceChat.tsx, HUD.tsx, styles.css | DialogShell.tsx, DrawerShell.tsx, SocialDock.tsx |
| Cinematic | HUD.tsx, cameraModes.ts, PlayerController.tsx, styles.css | CinematicPresentation.tsx, CameraModeControl.tsx |
| Map/Meditation | TempleGuide.tsx, world metadata/contracts (to be audited) | Not approved until prerequisites pass |

All new names are provisional. Reuse existing components if a clean extraction is possible without unnecessary churn.

## 7. Risks and safeguards

- **Gameplay regression:** protect PlayerController, input semantics, camera raycast and socket behavior with regression tests.
- **Voice teardown:** never unmount VoiceChat for visual collapse.
- **Modal input leakage:** centralize overlay ownership and explicitly lock/release gameplay input.
- **Mobile overlap:** test real viewport sizes and safe-area, not only CSS media queries.
- **Performance:** avoid broad store subscriptions, excessive blur and canvas remounts.
- **False feature claims:** Map and Meditation remain gated until their data and gameplay contracts exist.
- **Asset/copyright:** use original Buddhist World artwork and licensed assets; references are design principles only.

## 8. Commit and rollout sequence

One focused commit/PR slice per workstream:
1. `feat(ui): establish cinematic gameplay HUD foundation`
2. `feat(ui): standardize contextual interaction states`
3. `feat(ui): unify journal profile and social panels`
4. `feat(ui): add cinematic HUD and camera transitions`
5. `design(world): specify map and meditation prerequisites` (only if Phase 5 is still gated; do not implement unsupported UI).

Keep work on `feature/phase1-foundation-hardening` unless a separate implementation branch is explicitly selected. Do not merge, deploy, run migrations or alter production configuration as part of these frontend phases.

## 9. Definition of done

- Each phase passes typecheck, unit tests and build.
- Visual regression covers desktop and mobile.
- Gameplay movement, camera, collision, checkpoint, waypoint, NPC interaction, chat, voice and auth remain functional.
- Modal focus and keyboard/touch input behavior are verified.
- No fake or unsupported features are presented as implemented.
- Real-device performance is measured before any performance claim.
- Changes are reviewed as a focused diff before merge.
