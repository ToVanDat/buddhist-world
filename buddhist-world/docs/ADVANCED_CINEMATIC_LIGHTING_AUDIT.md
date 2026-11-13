# Advanced Cinematic Lighting — Phase 0 Audit

## Scope and baseline

- Repository: `ToVanDat/buddhist-world`
- Working branch: `feature/phase1-foundation-hardening`
- Audited baseline: `60e8297cbd3acc3a0b2f4e3528b7e4f8f53bea4e`
- Audit was read-only. No database, deployment, or production resources were changed.

## Existing systems found

| Area | Existing implementation | Audit result |
|---|---|---|
| Environment presets | `apps/web/src/game/world/CinematicLighting.tsx` | Four static presets; scene background, fog, ambient, hemisphere and directional light |
| Quality | `apps/web/src/game/rendering/quality.ts` | ULTRA/HIGH/MEDIUM/LOW/MOBILE; shadow, DPR, antialias and fog controls |
| Settings | `apps/web/src/stores/settings.ts` | Zustand quality state |
| Scene integration | `apps/web/src/game/GameCanvas.tsx` | Hard-coded day preset; quality props passed separately |
| Water | `apps/web/src/game/world/WaterSurface.tsx` | Shader water, planar pond reflection and waterfall mist/foam |
| PBR authoring | `blender/scripts/generate_pbr_material_library.py`, `generate_pbr_texture_maps.py` | Procedural materials/maps; actual Blender execution and rendered inspection remain unverified |
| Blender preview | `blender/scripts/generate_cinematic_environment.py` | Basic preview camera and lighting |
| World time | `apps/server/src/modules/world/worldClock.ts` | Existing clock supports NPC schedule time; not a replicated world environment state |
| Multiplayer | `apps/server/src/realtime/gateway.ts` and web socket client | Socket.IO region/player/NPC snapshots; no authoritative weather/lighting snapshot found |
| Diagnostics | `apps/web/src/game/rendering/PerformanceProbe.tsx` | FPS, frame time, draw calls, triangles, geometry and texture counts; no GPU timer-query benchmark |

## Gaps

1. No centralized Lighting Manager or reusable typed runtime Light Factory.
2. Environment and local architectural lights are not separate subsystems.
3. Quality settings are not represented as a lighting-specific capability profile.
4. Time-of-day presets are static; no client transition controller is integrated.
5. No authoritative world weather state or client weather interpolation was found.
6. No dedicated sky model, weather lighting, architectural light registry or camera post-processing pipeline was found.
7. Existing ACES tone mapping/exposure is embedded in the legacy lighting component.
8. No dedicated lighting unit, browser visual, Blender execution, or target-device performance test suite was found.

## Target architecture

- Shared, validated environment state is authoritative on the server when it affects all players.
- Clients interpolate environment snapshots locally; per-frame lighting values are never network-broadcast.
- Environment lighting and region-scoped architectural lighting have separate ownership and lifecycle.
- A single Lighting Manager owns scene background, fog, renderer tone mapping/exposure and environment lights.
- Quality profiles gate shadows, local lights, reflections and optional cinematic effects.
- Blender owns authoring, bake and render preview. R3F owns real-time runtime lighting. GLB is not treated as a transport for active Three.js light rigs.
- WebGL limitations are explicit: runtime area lights require an approximation or baked result; full dynamic GI and high-quality volumetrics are not assumed.

## Phase plan and gates

- Phase 1: typed profiles, light factory, centralized manager, shadow/quality integration and unit tests.
- Phase 2: sky and atmosphere with fallback paths.
- Phase 3: PBR color-space/material contract and Blender preview profiles.
- Phase 4: server-authoritative world time/weather snapshots and client interpolation.
- Phase 5: region-scoped architectural and environmental lights.
- Phase 6: camera mode and optional post-processing; no unapproved heavy dependency.
- Phase 7: regression, browser visual and performance validation.

## Validation boundaries

CI typecheck/unit/build and Python syntax checks can be run remotely. Blender rendering, GLB visual inspection, browser screenshots, GPU timing, memory profiling and target-device FPS require the user's local runtime/browser/device. Those are not marked complete until measured.
