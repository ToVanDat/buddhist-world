# Advanced Cinematic Lighting Architecture

## Runtime ownership

`LightingManager` is the single owner of scene-level background, fog, ACES tone mapping, exposure and environment lights. It receives a validated preset and the active quality tier. `LightFactory` renders typed directional, point, spot, ambient and hemisphere lights. Area lights are authored in Blender and must be baked or represented by an explicitly chosen WebGL approximation.

Environment lights are global and stable for the active scene. Architectural lights are region-scoped, registered separately and budgeted by quality tier. They must not be mounted globally for every region.

## Configuration

- `LightingProfiles.ts`: environment presets and quality capabilities.
- `LightingController.ts`: pure deterministic interpolation for local client transitions.
- `LightFactory.tsx`: typed declarative runtime light factory.
- `LightingManager.tsx`: scene and renderer owner.

The renderer retains Three.js ACES filmic tone mapping. Exposure is applied by the manager and restored on unmount. The quality profile limits shadow map resolution and whether shadows/fog/reflections/cinematic effects are eligible.

## Multiplayer contract

Server-authoritative time/weather snapshots are implemented in Phase 4 foundation. The server derives Vietnam-local time, resolves dawn/day/sunset/night blend windows, and broadcasts a validated snapshot to occupied Socket.IO regions every 10 seconds and immediately on join. Weather is selected by validated server environment values (`WORLD_WEATHER`, `WORLD_WEATHER_INTENSITY`). Clients validate snapshots and extrapolate the 60-minute transition locally between snapshots; per-frame light values are never network-broadcast. Runtime weather particle/physics effects and authenticated live weather administration remain future work.

## Blender responsibilities

Blender owns light-rig authoring, baked lighting/lightmaps, material preview and reference renders. Runtime light rigs are rebuilt from typed configuration; active Blender lights are not assumed to remain active after GLB export.

## Graceful degradation

- Low quality disables real-time shadows and planar reflections.
- Mobile uses a reduced local-light budget and disables planar reflections.
- Area lights use baked lighting or a documented runtime approximation.
- Volumetric effects and cinematic post effects remain opt-in and must have a no-effect fallback.
- No new post-processing dependency is introduced until its browser cost and compatibility are measured.

## Validation

Unit tests cover deterministic profile interpolation and invalid colors. CI typecheck/build covers component integration. Browser visual comparisons and GPU profiling remain manual acceptance gates until a browser automation/device benchmark is available.
