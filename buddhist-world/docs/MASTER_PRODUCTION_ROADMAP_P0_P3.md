# Buddhist World — Master Production Roadmap (P0–P3)

- Branch: `feature/phase1-foundation-hardening`
- Scope: world foundation, visual quality, gameplay depth, product readiness
- Audit date: 2026-11-13
- Status: source-level baseline recorded; runtime acceptance pending
- Rule: preserve existing world coordinates and contracts; do not replace working systems without evidence.

## Production rules

1. Work in dependency order: P0 → P1 → P2 → P3.
2. A feature is not complete merely because a component, shader or configuration exists.
3. Track each item as **Implemented + runtime verified**, **Source exists / verification pending**, **Placeholder**, **Missing**, or **Blocked**.
4. Do not fabricate authoritative world/map/NPC/session state in the client.
5. Do not replace existing GLB loader, LOD, instancing, lighting or water systems without a demonstrated defect.
6. No database migration, backend protocol change, production deployment or destructive asset operation without a separate reviewed plan.
7. Preserve these world anchors unless camera, physics, navigation and spawn tests approve a coordinated change:
   - Tam Quan: `(0, 0, 20)`
   - Courtyard: `(0, 0, 0)`
   - Main Hall: `(0, 0, -22)`
   - Lotus Pond: `(-18, 0, 4)`

## Current source findings

### Verified in the feature branch

- `GameCanvas.tsx` composes React Three Fiber Canvas, Rapier physics, lighting, weather, quality profiles and region content.
- `PlayerController.tsx` implements local movement, jump/run, nearby interaction/checkpoint detection, server movement reporting, camera follow and obstruction raycast.
- `core/input.ts` owns keyboard and pointer camera input.
- `packages/shared/src/regions.ts` defines `RegionAssetDef`, LOD and instance metadata, region bounds and spawn points.
- `RegionContent.tsx` loads region GLBs with Drei `useGLTF`; it already supports static assets, collision meshes, LOD, vegetation wind, instancing, NPC actors and world interaction props.
- `TempleRegion.tsx` explicitly identifies itself as a placeholder blockout. Main Hall and Tam Quan are currently primitive geometry; Lotus Pond water and a waterfall effect are also composed in this region.
- `REGIONS.temple_complex.assets` is currently empty and `blockout: true`.
- `REGIONS.temple_complex.navmesh` points to `/assets/navmesh/temple_complex.json`, but that exact file is not present in the feature branch. The Blender pipeline documentation explicitly says no final temple .blend or baked navmesh is currently in the repository.
- `PlayerController.tsx` falls back to `PlaceholderAvatar` unless `VITE_PLAYER_MODEL_URL` is configured.
- `LightingManager.tsx`, `CinematicPostProcessing.tsx`, `WaterSurface.tsx`, `StaticLodAsset.tsx`, `VegetationLodAsset.tsx` and `InstancedVegetationAsset.tsx` already provide substantial rendering infrastructure.
- `tools/validate-glb.mjs` checks GLB structure, geometry, materials/textures and character animation contracts.

### Not yet verified

- The configured navmesh path `apps/web/public/assets/navmesh/temple_complex.json` is referenced by the region manifest but the file is absent from the feature branch (404 on exact-path check); Blender pipeline documentation also states there is no final temple .blend or baked navmesh in the repository.
- Whether all GLB files referenced by the current project exist, load successfully and have correct transforms/materials.
- Whether a production player avatar URL is configured in the local runtime.
- Whether Main Hall, Tam Quan, Buddha statue, Willow and Banyan production assets exist outside the inspected manifest.
- Whether all placeholder meshes, debug helpers and temporary materials have been inventoried across the complete repository.
- Whether current camera behavior is acceptable on desktop and touch devices.
- Actual FPS, draw calls, GPU memory, network asset weight and loading times on target hardware.
- Runtime/visual acceptance of the recently changed HUD and UI phases.

## P0 — World foundation

### Implementation update — 2026-11-13

- Region manifest validator is present and now enforces positive, strictly increasing LOD distances.
- `TempleGuide.tsx` now presents a 2D coordinate projection of the active region's declared spawn anchors and the live player position. It does not fabricate route lines or pathfinding; navmesh remains missing.
- Vitest regression cases have been added for valid current metadata and invalid spawn/default-spawn/asset/LOD/duplicate-ID cases (`apps/web/src/game/world/regions.test.ts`). They are authored but **not yet executed**.
- Initial machine-readable placeholder inventory is recorded at `docs/PLACEHOLDER_INVENTORY.json`; this is a source-audit baseline, not a complete repository or runtime inventory.
- Added per-asset GLB load isolation with nested Suspense: loading one optional asset does not suspend the complete region; failed assets log their ID/path, show a development wireframe proxy, and are omitted in production rather than taking down the world scene.
- Touch input now releases a held joystick pointer when a blocking UI takes focus; unit tests cover input clearing/unlocking.
- Asset registry now enforces positive, strictly increasing LOD distances in declared order, reserved variant-kind identity and non-degenerate bounds; registry tests cover these contracts.
- P0 remains **IN PROGRESS**: automated execution, controller/runtime QA, navmesh and map-data readiness are still open.

| Work item | Current evidence | Status | Exit criteria |
|---|---|---|---|
| World Scene and Map | Region manifest, bounds, spawns and TempleGuide-style waypoint navigation exist; full map/discovery/route graph not proven | Partial | One authoritative region model; validated spawn/waypoint IDs; navmesh and collision agree; map UI only after map data contract |
| Camera and Player Controller | Rapier controller, orbit/follow camera, obstruction raycast and camera profiles exist | Source exists / runtime QA pending | No clipping/jitter; stable input and collision; keyboard, mouse, touch and modal states pass |
| Main Hall and Tam Quan | Primitive blockout in `TempleRegion.tsx` | Placeholder | Blender-authored, scale-correct GLB architecture; collision proxy; validated material/UV/normal; aligned to preserved anchors |
| Asset Registry and GLB Loader | Shared region asset definitions and `RegionContent` GLB loader exist; current default region asset list is empty | Infrastructure exists / content missing | Manifest references valid files; stable IDs; loading/error/fallback policy; collision/render flags; LOD/instance metadata validated |
| Full placeholder inventory | Known blockout and placeholder avatar found; repository-wide audit not complete | In progress | Inventory every placeholder by path, owner, replacement asset, priority and removal condition; no silent production fallback |

### P0 execution sequence

1. Audit all world, navigation, camera, collision, spawn and region files. **Done at source-audit level.**
2. Author the missing `NAVMESH_temple_complex` Blender collection, export the missing navmesh JSON, then validate schema, bounds, connectivity and correspondence to Rapier collision.
3. Build a placeholder inventory across source, public assets and Blender project/export directories; locate the user's working .blend if it exists outside the repository. **Known items recorded; repository-wide inventory still pending.**
4. Establish Blender asset naming, scale, origin, orientation, collision and GLB export contracts. **Existing conventions and pipeline docs identified.**
5. Author and validate Main Hall and Tam Quan hero assets plus collision proxies.
6. Register assets in the existing shared region manifest and load them through the existing `RegionContent` pipeline.
7. Remove only the blockout pieces replaced by verified assets; keep fallback behind an explicit development-only switch until acceptance.
8. Run movement, spawn, collision, camera obstruction and navigation regression tests.

**P0 gate:** no P1 polish work can compensate for an invalid world layout, missing hero architecture, broken navigation or unresolved placeholder fallback.

## P1 — Visual quality

| Work item | Current evidence | Status | Exit criteria |
|---|---|---|---|
| Realistic Architecture | Existing environment is still blockout in the default region | Blocked by P0 assets | Hero architecture with authored geometry, trim/detail, correct scale, UVs, PBR and optimized collision |
| Buddha Statue | No production statue confirmed in inspected region manifest | Asset audit required | Respectful, approved design; production mesh/materials; correct scale and placement; validated LOD |
| Willow and Banyan | Wind/vegetation renderers exist; exact production tree assets not confirmed | Asset audit required | Species-appropriate silhouettes, leaf cards/geometry, bark/leaf PBR, wind rig and distance LOD |
| PBR Materials | GLB PBR validator and weather-reactive materials exist | Infrastructure exists / asset quality pending | Base color, normal, roughness, AO and optional metalness packed/assigned correctly; consistent color management |
| Cinematic Lighting | Lighting profiles, sky, shadows, fog and post-processing exist | Source exists / art direction QA pending | Daylight readability, shadow stability, exposure consistency and quality-tier budget validated |
| Water Rendering | Pond shader, planar reflection and waterfall shader/foam/mist exist | Source exists / visual/performance QA pending | Correct shoreline, reflections, transparency, rain response, no z-fighting and measured GPU cost |

**P1 gate:** approve hero assets and one representative scene lighting/material pass before propagating material settings across the entire world.

## P2 — Experience depth

| Work item | Current evidence | Status | Exit criteria |
|---|---|---|---|
| NPC and Interaction | NPC actors, nearby interaction lookup, dialogue and world props exist | Source exists / behavior QA pending | NPC state, animation, prompt, dialogue and server response stay consistent; range/cooldown/error states work |
| Animation | GLB AnimationMixer and clip aliases exist; placeholder procedural avatar remains fallback | Partial | Character/NPC rigs and required clips validated; blending, root motion policy and retargeting documented |
| Wind Field | WindSway, VertexWind and BranchBoneWind exist | Source exists / scene QA pending | Coherent wind direction/gust profile across vegetation; no obvious deformation artifacts |
| Particle Engine | Weather and mist effects exist; general-purpose particle engine not confirmed | Partial / audit required | Budgeted emitters, deterministic lifecycle, pooling/instancing, quality scaling and cleanup |
| Mountain Fog | Scene fog and depth-based volumetric fog exist | Partial | Layered distance/height fog integrates with mountain silhouettes, weather and lighting without excessive overdraw |
| Cinematic Camera | Gameplay/Cinematic/Photo camera profiles exist | Partial | Smooth transitions, camera director/timeline, authored shots, collision-aware rails and player-control handoff |

**P2 gate:** gameplay events must be real and state-driven; visual effects must not fake interaction success or persistent progress.

## P3 — Product readiness

| Work item | Current evidence | Status | Exit criteria |
|---|---|---|---|
| Intro Video and Transitions | Camera modes/post-processing exist; full intro playback and sequence manager not confirmed | Missing / design required | Video asset pipeline, preload/fallback, audio sync, skip/accessibility and scene handoff tested |
| Audio Environment | No complete spatial ambience/audio manager confirmed in this audit | Audit required | Ambient zones, positional emitters, occlusion/attenuation policy, volume controls and lifecycle tested |
| LOD and Instancing | Static/vegetation LOD and instanced vegetation renderers exist | Source exists / profiling pending | Correct thresholds/hysteresis, culling, draw-call reduction and no visible popping |
| Performance Benchmark | Quality profiles, PerformanceMonitor and visual/GPU test scripts exist | Partial | Repeatable baseline by device tier; FPS/frame time, draw calls, memory, load time and regressions reported |
| Responsive and Visual QA | Responsive CSS and Playwright tests exist; full current UI/gameplay visual QA not completed | Pending | Screenshot review at agreed breakpoints; keyboard/focus/reduced-motion/touch; GPU and mobile-device pass |

**P3 gate:** release candidate requires repeatable performance results, full visual regression review and no critical interaction/accessibility defects.

## Cross-phase acceptance matrix

- Desktop: 1920×1080, 1440×900, 1280×800.
- Tablet: 1024×768, 768×1024.
- Mobile: 390×844, 360×800.
- Input: keyboard/mouse, touch joystick, pointer orbit, focus and modal blocking.
- Rendering: LOW, MEDIUM, HIGH, ULTRA and MOBILE profiles.
- Gameplay: spawn, movement, jump, run, collision, camera obstruction, NPC interaction, checkpoint, region bounds.
- Asset: missing-file handling, GLB validation, PBR validation, collision separation, LOD transition, instance count.
- Accessibility: focus visibility, Escape/close, reduced motion, readable contrast, non-color status cues.
- Performance: frame time, FPS, draw calls, texture memory, GLB download size, shader compile and initial scene load.

## Asset-independent continuation update (2026-11-13)\n\n- Added `docs/ASSET_INDEPENDENT_PHASE_EXECUTION.md` to continue system work across P0–P3 while final Blender assets are pending.\n- Added `validateRegionManifest` in shared region definitions to validate IDs, bounds, spawns, transforms, asset paths, LOD order and instance transforms without requiring GLB files.\n- `RegionContent` now reports manifest issues and explicitly logs when a region is using its documented blockout in development.\n- These changes are source-level only. Typecheck, tests, build, browser runtime and visual QA have not yet been run.\n\n## Current implementation boundary

This audit is source-based. It does not claim runtime visual correctness. No database, migration, backend protocol, production configuration or deployment was changed by this roadmap. Blender/3D Jutsu project discovery returned no existing projects, so direct scene editing cannot be attached to an existing 3D Jutsu project yet. Do not create a separate scene project or substitute generated assets without confirming that it is the intended production source.

## Immediate next task

**P0.1 — World/Navigation/Placeholder Audit:** inspect the navmesh file, enumerate all public assets and Blender source files, trace all spawn/waypoint/collision coordinates, and produce a per-asset replacement table. Then proceed to the Main Hall and Tam Quan hero-asset work using the existing asset pipeline.
