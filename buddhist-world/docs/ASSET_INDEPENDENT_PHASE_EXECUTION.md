# Buddhist World — Asset-Independent Phase Execution

Date: 2026-11-13
Branch: `feature/phase1-foundation-hardening`

## Decision

Continue P0–P3 without waiting for new Blender assets. Use existing runtime systems, deterministic procedural/test geometry, and clearly labeled placeholders. Do not represent procedural geometry or post-processing as final AAA art.

Two acceptance tracks are maintained:
- **System-ready:** architecture, contracts, behavior, lifecycle, performance controls and tests work with placeholder/test content.
- **Art-ready:** final authored assets are integrated and visually accepted. This remains pending until Blender assets are supplied.

No new database migrations, production deployments, backend protocol changes or destructive asset replacements are included in this plan.

## Work that can proceed now

### P0 — Foundation (asset-independent)

1. **World Scene and Map**
   - Treat `REGIONS` as the single source of region bounds, spawn points, and region identity.
   - Validate spawn IDs, default spawn membership, finite coordinates, and region bounds.
   - Build a map/navigation presentation from existing region/spawn/waypoint data only; label undiscovered/unavailable routes honestly.
   - Do not invent route connectivity or obstacle-aware navigation when no navmesh exists.
2. **Camera and Player Controller**
   - Validate keyboard, pointer orbit, touch, modal input lock, movement, jump/run, camera obstruction and spawn handoff.
   - Add deterministic test scenes and regression coverage; retain existing controller and physics implementation.
3. **Main Hall and Tam Quan**
   - Keep blockout explicitly marked as temporary.
   - Improve only scale/readability/collision/interaction test geometry where needed; do not call it final architecture.
4. **Asset Registry and GLB Loader**
   - Keep shared `RegionAssetDef` and `RegionContent` pipeline.
   - Add manifest validation and missing-file/error/fallback diagnostics.
   - Make fallback policy explicit: development placeholder vs production missing-asset state.
5. **Placeholder inventory**
   - Maintain a machine-readable inventory of known blockouts, placeholder avatar, missing navmesh and pending hero assets.
   - Each entry has owner, path/region, replacement requirement and removal/acceptance condition.
   - Initial source-audit inventory is now recorded at `docs/PLACEHOLDER_INVENTORY.json`; it is explicitly not a complete runtime or binary-asset scan.

### P0 implementation update — 2026-11-13

- `validateRegionManifest` now rejects non-positive LOD distances as well as non-finite/non-increasing thresholds.
- Added Vitest coverage for the current manifest, malformed spawn/default-spawn metadata, invalid asset paths, LOD ordering and duplicate identifiers at `apps/web/src/game/world/regions.test.ts`.
- Added `docs/PLACEHOLDER_INVENTORY.json` for the four currently evidenced placeholder/missing-art categories.
- Added an isolated per-asset React error boundary and nested `Suspense` in `RegionContent.tsx`: loading one optional GLB no longer suspends the whole region; a failed load is isolated, development displays a magenta wireframe diagnostic proxy, and production omits the failed optional asset while logging its identity.
- Gameplay input lock now broadcasts a release event so an active touch joystick pointer is cleared when a modal takes focus; added unit coverage for movement/action input clearing and unlock lifecycle.
- Follow-up P0 controller hardening: window blur now clears touch-axis and touch-sprint state as well as keyboard/action state; pointer-orbit movement is ignored while gameplay is blocked, and opening a modal cancels an in-progress captured orbit gesture.
- P1 weather-reactive PBR hardening: non-finite rain intensity now resolves to a dry material instead of propagating `NaN` into roughness/clearcoat; added regression coverage for `NaN` and `Infinity` alongside the existing wet-surface tests.
- Asset registry validation now requires positive, strictly increasing LOD distances in declared order, matches reserved variant IDs to their correct variant kinds, and rejects degenerate bounds. Existing registry fixtures were updated and regression cases added.
- **Verification status:** tests have been authored but not executed in this environment. Typecheck, build, browser runtime and visual acceptance remain pending.

**P0 system-ready gate:** region/spawn/asset manifests validate; camera/controller regressions pass; missing assets fail visibly and safely; placeholders are inventoried. Art-ready remains blocked by Blender assets.

### P1 — Visual systems (asset-independent subset)

- **PBR Materials:** audit material conventions, color space, normal maps, roughness/metalness handling, texture budgets and fallback materials. Validate using neutral test meshes.
- **Cinematic Lighting:** tune and test existing lighting profiles, exposure, shadows, fog and quality tiers with a repeatable neutral test scene.
- **Water Rendering:** test current pond shader, rain ripples, reflections, waterfall/foam and quality fallbacks; add guards for unsupported/expensive reflection paths if needed.
- **Realistic Architecture / Buddha Statue / Willow / Banyan:** prepare material/asset specifications, scale/origin/LOD/collision contracts and proxy placement. Do not claim final realism until final meshes/textures are supplied and reviewed.

**P1 system-ready gate:** shaders and material contracts behave across quality tiers, no shader errors/leaks, water degrades gracefully. Final art acceptance remains pending.

### P2 — Experience systems (asset-independent subset)

- **NPC and Interaction:** validate interaction state machine, distance/range, prompt lifecycle, dialogue/choice/quest response and server-authoritative success/failure.
- **Animation:** validate AnimationMixer/clip aliasing, crossfade, pause/resume and missing-clip fallback with test rigs or simple proxy clips. Final character rig/retargeting waits for production characters.
- **Wind Field:** verify deterministic direction/gust/intensity and shared behavior across vegetation renderers using test meshes.
- **Particle Engine:** audit current rain/fog/mist/water particles; standardize budgets, lifecycle, pooling/instancing strategy, reduced-motion and quality scaling. Do not add a duplicate engine if existing systems suffice.
- **Mountain Fog:** validate scene fog and volumetric fog with a proxy mountain silhouette; enforce mobile/low-quality fallback.
- **Cinematic Camera:** implement/test transition orchestration, camera collision, input handoff and authored camera-path data using proxy targets. Full authored cinematic shots wait for final scene art.

**P2 system-ready gate:** all state transitions and lifecycle tests pass; no orphaned listeners/materials/geometry; quality scaling is measurable.

### P3 — Product readiness (asset-independent subset)

- **Intro Video and Transitions:** build sequence orchestration, preload/error/skip/fallback behavior and scene handoff. Use a neutral temporary clip or color/scene transition until final intro video exists.
- **Audio Environment:** build audio zones, positional emitter lifecycle, attenuation, mute/volume settings and graceful missing-file handling. Use generated/test tones or licensed temporary ambience only; do not bundle unlicensed music.
- **LOD and Instancing:** test existing static/vegetation LOD and instancing with generated test meshes; verify hysteresis, culling and stable instance transforms.
- **Performance Benchmark:** capture frame time p50/p95/p99, FPS, draw calls, triangles, geometry/texture counts, asset bytes and scene load time for each quality tier.
- **Responsive and Visual QA:** validate current UI and proxy scene at desktop/tablet/mobile viewports; keyboard, touch, focus, reduced-motion, safe areas and visual regression.

**P3 system-ready gate:** repeatable benchmark and QA reports exist; temporary media is clearly labeled; no critical functional/accessibility/performance regression.

## Suggested implementation order

1. P0.1 manifest and placeholder diagnostics.
2. P0.2 camera/controller automated and manual regression matrix.
3. P0.3 proxy world map based only on known region/spawn data.
4. P1.1 PBR/material validation and lighting/water quality-tier validation.
5. P2.1 interaction and animation lifecycle validation.
6. P2.2 wind/particle/fog budgets and cinematic camera transition system.
7. P3.1 audio lifecycle and intro sequence orchestration.
8. P3.2 LOD/instancing and performance benchmark.
9. P3.3 responsive/visual QA.
10. Later: integrate final Blender assets and repeat all art/performance acceptance tests.

## Current known constraints

- Default region `temple_complex` currently has `assets: []` and `blockout: true`.
- `TempleRegion.tsx` is explicitly temporary blockout geometry.
- Player controller currently falls back to `PlaceholderAvatar` unless `VITE_PLAYER_MODEL_URL` is configured.
- Region navmesh path is declared but the JSON file is absent from the branch; obstacle-aware pathfinding must not be claimed.
- Existing infrastructure includes shared region asset definitions, `RegionContent` GLB loader, static/vegetation LOD, instancing, lighting profiles, weather, wind, water shaders, fog particles, post-processing, NPC actors, interaction props and performance telemetry.
- Source existence is not runtime acceptance. Every changed phase must pass typecheck, unit tests, build, visual tests and manual runtime review where applicable.

## Status vocabulary

- `READY`: implementation and automated/manual acceptance evidence exists.
- `SYSTEM-READY / ART-PENDING`: runtime systems can be used with proxies; final art is pending.
- `IN PROGRESS`: partially implemented or validation incomplete.
- `BLOCKED`: required contract or source material is missing.
- `NOT STARTED`: no implementation yet.

Never mark a feature READY solely because its source file exists.

## Follow-up implementation update — P0 to P3 (2026-11-13)

### P0 — controller safety
- PlayerController now checks the gameplay input lock inside its physics frame before processing movement, sprint, jump and interaction. This protects against stale input state during modal transitions.
- Extracted the follow-camera obstruction-distance resolver and added deterministic tests for unobstructed, near-wall, invalid-hit and invalid-distance cases; the controller now uses that tested resolver.
- resolveCameraDistance now falls back to the active camera mode's minimum distance when user distance is non-finite.
- Added camera-distance boundary tests. Camera obstruction, Rapier collision, spawn handoff and real touch-device behavior still require runtime/browser acceptance.

### P1 — weather/PBR/lighting/water robustness
- WeatherLighting and the shared wind resolver sanitize non-finite weather intensity before calculating lighting/fog/wind.
- WeatherReactiveMaterial now resolves invalid rain intensity to dry-state wetness before updating the physical material.
- Rain and fog particle effects use finite, clamped intensity resolvers; regression tests cover NaN, Infinity and out-of-range values.
- Existing LightingProfiles, LightingManager and WaterSurface quality/reflection systems are retained. Existing tests already cover quality budgets, water rain ripple gating and weather response; these tests still need execution.
- These are numeric/lifecycle safeguards, not a claim that PBR textures, architecture or water art have achieved final visual quality.

### P2 — NPC/animation/wind/particles/fog
- Existing NpcActors, GLBAvatar, WindField, VertexWind, RainWeatherEffect and FogWeatherEffect were audited as the current system baseline; no duplicate particle engine was introduced.
- GLBAvatar now clamps AnimationMixer delta to a finite 0–50 ms step after tab suspension or long frame stalls; regression tests cover invalid and oversized deltas.
- Existing NPC clip alias tests, wind determinism tests, vertex-shader tests and rain/fog budget tests remain the acceptance baseline. Full NPC server-state transitions, real rig blending and mountain-silhouette visual QA are still pending.

### P3 — intro, ambience and benchmark
- Added introSequence.ts as an asset-independent state machine for loading, ready, playing, completed, skipped, failed and reset states, with transition tests.
- Added WorldIntroVideo overlay with native video controls, explicit play gesture, skip, error fallback and gameplay-input lock. It is enabled only when VITE_WORLD_INTRO_VIDEO_URL is configured.
- Added WorldAudioSession and WorldAudioManager: ambience waits for a user gesture, loops, pauses when the tab is hidden, resumes when visible, clamps volume and disposes cleanly. It is enabled only when VITE_WORLD_AMBIENCE_URL is configured.
- Added lifecycle tests for the audio session and documented both optional environment variables in the root .env.example. No audio or video media file was fabricated or bundled.
- Existing PerformanceProbe and Playwright performance/hardware visual tests already capture frame-time percentiles, frame hitches, draw calls, triangles, geometry/texture counts, WebGL renderer details and JS heap where available. Physical GPU benchmark remains a manual target-device run; standard WebGL cannot report portable VRAM usage.

### Verification boundary
- New and existing tests have been authored/updated in the branch but have not been executed here. Run typecheck, Vitest, build and Playwright visual/hardware suites locally before treating any phase as System-ready.
- No Blender assets were created or integrated. Art-ready acceptance remains intentionally deferred.
- No database migration, backend protocol change, production deployment or destructive asset replacement was performed.
