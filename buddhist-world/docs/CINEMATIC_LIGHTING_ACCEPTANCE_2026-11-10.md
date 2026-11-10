# Cinematic Lighting Acceptance — 2026-11-10

## Scope and evidence

Reviewed the supplied `buddhist-world-lighting-visual-qa-fixed.zip` Playwright artifact (screenshots for Dawn, Day, Sunset, Night, and Night+Rain on mobile). This is browser/WebGL smoke evidence for the current blockout scene; it is not a Blender render or final-art acceptance.

The current repository branch is `feature/phase1-foundation-hardening`. The Draft PR remains open and unmerged. No changes to `main`, database, deployment, or production environment were made.

## Visual findings

| Area | Observed result | Acceptance |
|---|---|---|
| Dawn | Sky is almost uniform pale/white; terrain is a flat dark plane; gate and distant waterfall are low-detail blockout shapes | FAIL — lighting cannot be judged against final materials/environment |
| Day | Sky remains almost white and lacks a readable atmospheric gradient; strong flat ground and simple gate silhouettes dominate | FAIL |
| Sunset | Ground warms, but sky remains nearly white; long hard shadows dominate; no convincing sunset horizon/volumetric depth | FAIL |
| Night | Night background fallback works and avoids the earlier bright procedural sky; architecture and ground are too dark to read; distant waterfall is a small silhouette | PARTIAL |
| Night + Rain / Mobile | Screenshot artifact exists; this verifies capture/runtime path only, not weather fidelity or mobile performance | NOT ACCEPTED |

A large translucent triangular/conical light volume is visible in front of the gate in Dawn, Day, Sunset and Night. It is consistent with an incorrectly exposed or positioned spot-light helper/fixture, but the screenshot alone cannot prove which light creates it. Trace the active region's architectural light definitions and targets before changing coordinates or intensity.

The fixed screenshot set demonstrates that the night-sky regression was addressed, but does not establish cinematic/AAA visual quality. The scene is still a procedural blockout.

## Phase status and release gates

### Phase 3 — Blender / PBR / GLB
**Status: tooling implemented; asset acceptance BLOCKED.**

The repository contains Blender lighting rig, scene validation, PBR graph validation, render acceptance and batch export scripts. CI compiles Blender Python files but does not execute Blender. The supplied artifact is a Playwright ZIP, not a `.blend` project or exported GLB set. No active Blender executable or source scene was available in the validation environment.

Required before acceptance:
1. Run the scripts in Blender against the actual authored temple `.blend`.
2. Confirm active camera, world nodes, preview profile, light rig and collection isolation.
3. Run PBR graph validation; inspect UV unwraps, texel density, tangent normals and AO export to glTF.
4. Export GLB and run the repository GLB validator.
5. Open the exported GLB in the browser and inspect material response, scale, normals, UVs and lighting.

The generated 512px procedural texture set is a prototype baseline, not a hero-asset quality target. AO is not accepted as a glTF occlusion texture until the exported GLB is inspected.

### Phase 2 — Sky / exposure / fog / shadow
**Status: night-sky fallback fixed; visual tuning BLOCKED.**

Do not tune exposure or sun energy solely from source values. Dawn/Day/Sunset screenshots show a nearly white sky and poor separation between sky, horizon and terrain. Establish a repeatable camera/render baseline with the final environment and PBR materials, then tune sky gradient, sun disc, exposure, fog distance/color and shadow softness together. Keep Night on the background fallback until a dedicated night-sky implementation is accepted.

### Phase 5 — Architectural lighting
**Status: runtime light framework implemented; placement BLOCKED.**

The visible cone in front of the gate must be traced to its owning light and target. Validate each fixture from the authored lantern/light-mesh position and inspect spill, falloff, shadowing and day/night dimming in the complete temple scene. Do not guess fixture coordinates from the current blockout screenshot.

### Phase 4 — Weather / wind / wet surfaces / reflections
**Status: weather snapshot and lighting response implemented; visual systems PARTIAL.**

The current implementation supports authoritative weather state, lighting/fog response and rain visuals. Wind-driven vegetation, physically plausible wet-surface roughness/clearcoat response and puddle accumulation are not accepted as implemented. The lotus pond planar reflection is an extra render pass and requires artifact/performance testing at each quality tier. Validate rain streak scale, wind direction, puddle placement, roughness changes and reflection stability against final geometry.

### Phase 6 — Cinematic effects
**Status: camera profiles and quality-gated Bloom/vignette foundation implemented; DOF/volumetrics DEFERRED.**

Do not add depth of field or volumetric lighting until the final camera/focus target and base lighting are accepted. Add one effect at a time and capture before/after screenshots with frame-time measurements. Keep expensive effects disabled on LOW/MOBILE.

### Phase 7 — Performance
**Status: DEV counters and short CI load ramp exist; device acceptance BLOCKED.**

The DEV probe reports FPS/frame-time statistics and scene counters. The previously recorded 10/25/50/100-player CI ramp is a short GitHub-hosted test, not a production capacity guarantee. The extended 30-minute soak remains opt-in and has not been run. Browser GPU timing, memory profiling, target-device tests and planar-reflection cost are not yet accepted.

## Next safe execution order

1. Supply/open the actual Blender source scene and run Phase 3 acceptance. Do not modify or overwrite the source file; generate outputs to a separate path.
2. Re-render Dawn/Day/Sunset/Night from the same camera and environment after PBR/GLB acceptance; then tune Phase 2.
3. Trace and correct the gate cone and fixture placements in Phase 5 using the complete model.
4. Implement and visually validate wind, wet surfaces and puddles in Phase 4; profile pond reflections.
5. Only then enable DOF/volumetrics and finish Phase 6.
6. Run browser/device profiling and the opt-in multiplayer soak for Phase 7.

## Explicit non-claims

No final Blender scene, production-quality hero asset, accepted PBR bake, final GLB, AAA visual quality, GPU benchmark, 30-minute soak, two-network voice QA, production deployment or PR merge is claimed by this report.
