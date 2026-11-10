# Runtime phases that can progress before Blender assets

Updated: 2026-11-10

This source-only implementation advances runtime systems that do not require artist-authored `.blend` files. It does not claim final temple visual acceptance.

## Completed source changes in this pass

### Phase 2 — sky, fog and weather transitions
- The Drei Sky baseline was tuned to reduce the pale/white haze observed in Dawn/Day/Sunset captures.
- `applyWeatherLighting` now adjusts sun energy, ambient response, fog range and fog tint for cloudy, rain and fog weather.
- `interpolateLightingProfile` smooths lighting channels frame-rate-independently so server snapshot changes do not hard-cut the scene lighting.
- The scene fog remains a low-cost linear fog system; no volumetric fog is claimed.

### Phase 4 — wind, rain and wet surfaces
- `WindSway` now has a gentle ambient breeze even in clear weather, weather-scaled gusts, deterministic per-asset phase and prevailing wind direction.
- Wind sway is mounted inside each eligible static foliage asset's local transform group rather than around the region origin. Collision-enabled objects are excluded.
- `RainWeatherEffect` now uses the same deterministic prevailing wind direction as foliage and reduces the mobile rain budget to 80 particles.
- `WeatherReactiveMaterial` adjusts roughness and clearcoat under rain and is used on the waterfall blockout rocks/moss.
- This is still transform-level foliage sway, not vertex-level branch deformation. Instanced/LOD foliage is not animated by this component yet.
- Wetness is a material response only: puddle accumulation, terrain wetness masks, decals and impact splash systems remain outstanding.

### Phase 5 — light and shadow quality budget
- The lighting quality profile is now the shared source for shadow resolution, local-light count, planar reflection resolution and post-processing limits.
- ULTRA/HIGH/MEDIUM use 768/512/256 planar reflection targets respectively.
- LOW and MOBILE disable planar reflections, cinematic post-processing and real-time shadows. MOBILE uses a 512 shadow-map ceiling if a caller explicitly overrides the renderer's base profile.
- Reflection overrides are capped at the active tier's maximum.
- Bloom strength and post-process pixel ratio are quality-specific; DOF and volumetrics remain deferred.
- This controls cost but does not resolve the gate's triangular bright artifact. That shape is visible in the supplied QA screenshot; its source is not yet proven, so fixture positions have not been guessed.

### Phase 7 — telemetry and tests
- DEV telemetry now uses a bounded 180-sample ring buffer instead of shifting an array every frame.
- Reports rolling average, p95, p99, max frame time, frames slower than 33.333 ms, draw calls, triangles, geometries, textures, active shader programs and sample count.
- HUD exposes tail latency and hitch counters.
- Added tests for the ring buffer, tail-latency summaries, weather wind/fog response, smoothed lighting interpolation and quality budgets.

## Visual QA and acceptance gates

A new CI run is triggered by the current PR head and runs typecheck, unit tests, build and browser lighting QA. Until that run completes, these source changes are not marked CI-passed.

The Playwright visual harness covers Dawn/Day/Sunset/Night, weather clear/cloudy/rain/fog and quality ULTRA/HIGH/MEDIUM/LOW/MOBILE. Its screenshots are browser/WebGL smoke evidence, not a final-art pixel baseline or GPU benchmark.

The supplied Dawn screenshot still shows:
- nearly white sky and a flat blockout horizon;
- a simple temple gate and flat ground;
- a translucent triangular region in front of the gate whose source is not established.

The supplied Sunset screenshot shows the same blockout limitations and the same triangular region. Do not label the sky tuning accepted until the new CI screenshots are reviewed.

## Remaining work

1. Review the newly generated Playwright screenshots after CI completes and tune sky/exposure/fog/shadow only from those captures.
2. Trace the gate triangular artifact to its actual mesh/light/shadow owner before changing it.
3. Add vertex-level foliage wind after authored pivot conventions are established; extend to instanced/LOD foliage.
4. Add terrain wetness masks, puddles and splash response after terrain/material UV conventions are known.
5. Validate architectural fixture positions against the complete authored temple.
6. Execute Blender PBR/UV/AO validation and GLB export against the real scene.
7. Run target-device GPU/frame-time/memory profiling and the opt-in 30-minute multiplayer soak.

## Safety and validation notes

- Changes are isolated to `feature/phase1-foundation-hardening`.
- No generated asset, database migration, production deployment, merge or modification to `main` was performed.
- A passing CI run is not a substitute for Blender render acceptance or physical-device performance measurements.
