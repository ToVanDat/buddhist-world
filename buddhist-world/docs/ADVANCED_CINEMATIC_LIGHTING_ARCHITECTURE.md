# Advanced Cinematic Lighting Architecture

## Runtime ownership

`LightingManager` is the single owner of scene-level background, fog, ACES tone mapping, exposure and environment lights. It receives the validated world-environment snapshot and the active quality tier. `LightFactory` renders typed directional, point, spot, ambient and hemisphere lights. Area lights are authored in Blender and must be baked or represented by an explicitly chosen WebGL approximation.

Environment lights are global and stable for the active scene. Architectural lights are region-scoped, registered separately and budgeted by quality tier. They must not be mounted globally for every region.

## Configuration

- `LightingProfiles.ts`: dawn/day/sunset/night profiles and quality capabilities.
- `LightingController.ts`: pure deterministic interpolation for local client transitions.
- `LightFactory.tsx`: typed declarative runtime light factory.
- `LightingManager.tsx`: scene and renderer owner.
- `ArchitecturalLighting.tsx`: region filter, priority budget and local-light day/night dimming.
- `TempleArchitecturalLights.tsx`: temporary fixture coordinates aligned to the current temple blockout.
- `CinematicPostProcessing.tsx`: optional Three.js EffectComposer stack.

The renderer retains Three.js ACES filmic tone mapping. Exposure is applied by the manager and restored on unmount. The quality profile limits shadow map resolution, local lights, shadows/fog/reflections and optional cinematic effects.

## Multiplayer contract

Server-authoritative time/weather snapshots are implemented in the Phase 4 foundation. The server derives Vietnam-local time, resolves dawn/day/sunset/night blend windows, and broadcasts a validated snapshot to occupied Socket.IO regions every 10 seconds and immediately on join. Weather is selected by validated server environment values (`WORLD_WEATHER`, `WORLD_WEATHER_INTENSITY`). Clients validate snapshots and extrapolate the transition locally; per-frame light values are never network-broadcast. Rain streak particles are rendered locally with quality-tier budgets; wind-driven vegetation, wet-surface response and authenticated live weather administration remain future work.

## Region fixture contract

The current `temple_complex` light definitions are temporary runtime light sources positioned relative to the known blockout geometry: Tam Quan columns, the front of the main hall, the central path and the lotus pond. The source lights do not yet have finished lantern meshes or artist-approved fixture models. Their coordinates and intensity must be reviewed against the final Blender scene before the environment is visually accepted. The region component is mounted only while the matching region is active.

## Blender responsibilities

Blender owns light-rig authoring, baked lighting/lightmaps, material preview and reference renders. Runtime light rigs are rebuilt from typed configuration; active Blender lights are not assumed to remain active after GLB export. The preview rig is isolated from all export collections.

## Camera and post-processing

The existing player-follow/orbit camera remains responsible for collision-aware camera placement. Local camera profiles provide Gameplay, Cinematic and Photo framing with different FOV, minimum distance, look height and smoothing. These are local presentation settings and are not replicated to other players.

The optional post stack uses Three.js examples modules: RenderPass, subtle UnrealBloomPass and VignetteShader. It is mounted only for ULTRA/HIGH quality tiers. Depth of field is deferred until a stable focus target and browser/GPU cost are measured; volumetric lighting is not implemented.

## Graceful degradation

- LOW disables real-time shadows, fog and the atmospheric sky dome; it also disables the cinematic composer.
- MOBILE uses a reduced local-light budget, disables the atmospheric sky dome and planar reflections, and disables the cinematic composer.
- MEDIUM keeps the sky and planar reflection capability but disables the cinematic composer.
- Area lights use baked lighting or a documented runtime approximation.
- Post-processing is optional and quality-gated; no external post-processing dependency was added.

## Validation

Unit tests cover deterministic profile interpolation, region-scoped light selection, day/night dimming, camera profile resolution and frame-time percentile math. CI typecheck/build covers component integration. The DEV PerformanceProbe reports FPS, average and rolling p95 frame time, draw calls, triangles, geometry and texture counts. It is diagnostic telemetry, not a GPU timer-query benchmark.

Browser visual comparisons, Blender rendering, GLB inspection, CPU/GPU profiling, memory snapshots, accessibility review and target-device benchmarks remain manual acceptance gates. See `docs/CINEMATIC_LIGHTING_ACCEPTANCE.md`.
