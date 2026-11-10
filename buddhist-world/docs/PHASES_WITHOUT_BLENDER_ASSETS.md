# Source-only implementation phases 8–12

Updated: 2026-11-10

This document records code, pipeline, validators and automated checks that can be completed before final Blender/GLB assets exist. It deliberately separates source implementation from acceptance on authored assets and target hardware.

## Phase 8 — advanced vegetation wind

Implemented:
- VertexWind.tsx injects a bounded vertex-deformation layer into cloned Three.js materials. Wind time, normalized direction, strength and per-material amplitude are uniforms; vertex color R is the optional bend mask.
- Static foliage and vegetation LOD render paths now use vertex wind in addition to their low-amplitude pivot sway.
- Instanced foliage now combines per-instance rotation with per-vertex deformation, while preserving each source instance transform and deterministic phase.
- Cloned wind materials are disposed when their owning render component unmounts.
- Unit tests cover shader injection, incompatible shader fallback, normalized direction, intensity bounds and invalid time.

Asset contract still required:
- Tree/branch meshes should have origin/pivot at the trunk base.
- Vertex color R should encode bend weight: trunk near 0, flexible branches/leaves toward 1.
- Author leaf cards/meshes with sensible normals and separate material slots.
- Rigged hero trees may use branch bones; the current shader path is intended for static/instanced foliage, not a substitute for a hand-authored skeletal rig.
- Wind amplitude/height scaling must be tuned on real tree meshes. Without the vertex mask, the shader uses a conservative fallback weight.

## Phase 9 — PBR, UV, AO and texture pipeline

Implemented:
- Blender asset_validation.py checks applied scale, UV presence, material assignment, triangle budgets, n-gons and texture dimensions.
- Blender validate_pbr_materials.py checks required authoring material nodes, UV links, map color spaces, tangent normal decode and map dimensions.
- GLB validator now has an explicit --strict-pbr mode requiring base-color, metallic-roughness, normal and occlusion textures on each render material and checks UV0 when textures are present.
- glb-pbr-policy.mjs has independent Node tests for strict and non-strict policy behavior.

Usage after GLB assets are authored:

```bat
pnpm validate:glb -- apps/web/public/assets --strict-pbr
pnpm validate:glb -- apps/web/public/assets/characters --character --strict-pbr
```

The standard CI asset pass still uses --allow-empty because the repository has no final GLB files yet. A green empty-folder pass is not an asset acceptance result. Strict PBR is intentionally opt-in until the first artist-authored GLBs are ready.

## Phase 10 — architectural lighting and baked lighting

Implemented:
- Runtime lighting definitions are region-scoped and capped by quality-tier local-light budgets.
- Existing temple lantern/fixture coordinates remain explicitly marked as temporary blockout positions.
- validate_baked_lighting.py checks EXPORT_* meshes for a UV_Lightmap layer, render UV selection and scene bake metadata. --require-baked turns missing bake metadata/UVs into errors.
- The validator is read-only and does not start or alter a bake.

Remaining asset-dependent work:
- Align fixture origins/targets to the final lantern and architectural meshes.
- Author non-overlapping lightmap UVs and bake per quality/platform profile.
- Verify lightmap color space, packing, resolution, seams, shadow bias and dynamic-light separation in Blender and browser.
- Never treat the current blockout light coordinates as final temple lighting.

## Phase 11 — cinematic post-processing

Implemented:
- CinematicPostProcessing now includes a depth-aware ray-marched volumetric fog pass with a fixed maximum of 16 shader iterations.
- ULTRA uses 16 steps and enables DOF; HIGH uses 8 fog steps and disables DOF; MEDIUM/LOW/MOBILE do not run the volumetric pass or DOF.
- Fog density is driven by the authoritative weather snapshot and is zero in clear weather.
- Existing bloom/vignette remain quality-budgeted.

Acceptance limits:
- The raymarch is a bounded screen-space approximation driven by the scene depth buffer, not a full physically based participating-media renderer.
- Depth of field currently uses a fixed focus distance. It must be tuned or replaced with a gameplay camera focus target before being enabled on a shipping gameplay profile.
- Validate depth texture support, WebGL renderer behavior, image stability and frame-time cost on target GPUs. The browser CI runner uses SwiftShader and cannot establish real-GPU performance.

## Phase 12 — performance, memory and multiplayer automation

Implemented:
- DEV frame telemetry tracks average, p95, p99, max frame time, frames over 16.667 ms, hitches over 33.333 ms, draw calls, triangles, geometry, texture and shader-program counts.
- performance.visual.spec.ts records a browser frame-time sample, WebGL renderer/version/capability data and JS heap metrics when the browser exposes them. It attaches a JSON report to the Playwright artifact.
- GPU VRAM is deliberately reported as unavailable: WebGL does not provide a portable VRAM usage API.
- CI retains an opt-in workflow_dispatch job for a 50-player reconnect storm and 30-minute / 100-player soak. It remains opt-in because it consumes a long-running runner and should not run on every pull request.

Still required on actual target hardware:
- GPU timestamp queries or vendor profiler capture, VRAM measurement, thermal/clock observation and sustained frame-time baselines.
- Desktop and mobile device matrix with agreed FPS/p95 budgets.
- Browser tab background/foreground, context-loss and reconnect testing.
- Execute the manual CI soak job and inspect server CPU/RAM, DB/Redis load, socket latency, disconnect/reconnect counts and memory growth.

## Current visual evidence

The latest reviewed Playwright artifact for the previous source head contains Dawn, Day, Sunset, Night, Clear, Cloudy, Rain, Fog and Mobile Night/Rain screenshots. The browser test step passed with no page errors. Visual review still shows blockout limitations:
- Day/Dawn sky is still very pale and needs art-direction tuning.
- The temple, terrain and path are still blockout geometry; there are no final foliage/lantern hero assets to judge.
- Night and Mobile Night/Rain are too dark to judge final architectural readability.
- The triangular/trapezoid shape in front of the gate is the TempleRegion blockout path plane, not a confirmed light cone.

This is browser smoke evidence only. It is not final visual acceptance, an image-regression baseline or a hardware benchmark.

## Safety and handoff

- All changes remain on feature/phase1-foundation-hardening; PR #1 remains Draft/Open.
- No main changes, merge, production deployment, user database migration or destructive operation was performed.
- No generated or placeholder GLB has been added to impersonate final art.
- The next asset handoff should provide authored tree vertex colors/pivots, final PBR texture sets, final temple/lantern meshes, lightmap UVs and a target-device matrix. The code and validators are now ready to validate those inputs, subject to CI on the new head.
