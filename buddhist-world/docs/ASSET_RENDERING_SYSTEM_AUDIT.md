# Asset, Rendering & World Systems Audit

**Audit date:** 2026-11-12  
**Repository branch:** `feature/phase1-foundation-hardening`  
**Scope:** source inspection of Blender scripts, shared region definitions, R3F runtime, validators, CI-oriented tests and project status documents.  
**Evidence boundary:** this is a source audit. No Blender process, local browser session, physical GPU benchmark or target-device runtime was executed by this audit.

## Status vocabulary

- **IMPLEMENTED (source):** code exists and is wired into a runtime or pipeline path.
- **PARTIAL:** a usable foundation exists, but important capabilities or integration are missing.
- **TOOLING ONLY:** scripts/docs exist; generated output or runtime acceptance is not evidenced.
- **MISSING:** no implementation was found in the audited branch.
- **BLOCKED BY ASSET / DEVICE:** code path exists but cannot be accepted without real authored assets or hardware evidence.

A source file or green syntax check is not proof of visual, runtime or production acceptance.

## Executive summary

The project already has a substantial rendering and content foundation. It should be extended, not rewritten. The largest architectural gaps are a versioned asset registry, a single authoritative wind field, a complete PBR texture/export contract, a general particle lifecycle, richer water optics, and repeatable visual/performance acceptance.

The region manifest currently defines `temple_complex.assets: []` and keeps the blockout enabled. Consequently, the runtime systems are not yet being exercised against the intended final temple and vegetation GLBs.

## System-by-system audit

| System | Priority | Current status | Evidence / gap |
|---|---:|---|---|
| High-poly sculpt pipeline | P0 | TOOLING ONLY | Buddha/hero authoring workspaces and bake scripts exist. No Blender-generated or artist-approved high-poly hero file is evidenced. |
| Retopology | P0 | TOOLING ONLY | Quadriflow/retopology starter tooling exists. Manual edge flow, pole cleanup, deformation review and accepted low-poly meshes remain artist tasks. |
| UV / texel density | P0 | PARTIAL | UV unwrap and basic UV presence/range checks exist. UV overlap, texel-density measurement, per-asset density policy and automated reports are not complete. |
| PBR material library | P0 | PARTIAL | Named Principled material library and procedural texture-map generation exist. The generated map set does not yet fully satisfy the runtime strict-PBR contract: the GLB policy expects base color, metallic-roughness, normal and occlusion textures; the authoring generator currently creates separate base-color/roughness/normal/AO images, has no metallic map, and describes AO as packed for export rather than proving it is connected as glTF occlusion. |
| Texture baking | P0 | TOOLING ONLY | Hero bake scripts exist, including selected-to-active workflows. No baked maps from a reviewed high/low pair have been inspected or accepted. |
| LOD generation | P1 | PARTIAL | Decimation scripts and static/vegetation LOD renderers exist. Generated LODs are starting ratios, not silhouette/shading-approved representations. No real LOD set is registered in the region manifest. |
| Asset registry / manifest | P0 | PARTIAL | A typed region manifest exists in shared code with paths, transforms, LODs, cull distance and instances. It lacks a separate versioned asset registry with content hashes, source lineage, dependencies, semantic tags, acceptance state, budgets and generated-artifact provenance. |
| GLB runtime integration | P0 | PARTIAL | R3F `useGLTF`, region-scoped mounting, static LOD, vegetation instancing and Rapier collision paths exist. No final runtime GLBs are registered; chunk streaming and asset lifecycle/eviction are incomplete. |
| Vegetation engine | P1 | PARTIAL | Instanced vegetation, LOD rendering, vertex deformation and optional branch-bone wind exist. Biome-aware placement, density constraints, culling/streaming at scale and target-device validation remain incomplete. |
| Wind Field / Physics Bridge | P1 | PARTIAL | Weather-derived wind is consumed by transform sway, vertex shaders, branch bones and instanced vegetation. These paths calculate strength/motion separately; there is no single world-space Wind Field snapshot/API shared by foliage, particles, water and physics objects. |
| Water rendering | P1 | PARTIAL | Animated pond/waterfall shaders, rain ripples, planar pond reflection and waterfall foam/mist exist. Refraction, scene-depth absorption/shoreline intersection, robust depth-based color, flow maps and interaction-driven ripples are not implemented as a unified water system. |
| Particle core | P1 | PARTIAL | A shared instanced incense smoke emitter exists. It is not yet a general emitter/simulation/pooling system and has no shared collision, lifecycle, GPU budget or event interface. |
| Volumetric rendering | P2 | PARTIAL | A depth-aware screen-space fog pass ray-marches a small fixed number of steps. Light shafts, local volumetric lighting and a broader atmosphere integration are missing; this is not a full volumetric renderer. |
| Post-processing | P1 | PARTIAL | EffectComposer includes bloom, vignette, optional Bokeh DOF and a fog pass behind quality gates. Explicit color-grading/LUT controls and measured per-tier GPU budgets are not evidenced. |
| Cinematic lighting | P1 | PARTIAL | Dawn/day/sunset/night profiles, weather response, architectural lights and quality profiles exist. Final scene balance, exposure calibration and shadow/reflection acceptance require real assets and captured comparisons. |
| Environment scatter | P1 | PARTIAL | The region data model supports instance transforms and Blender contains vegetation/ground-generation scripts. A reproducible biome/scatter authoring pipeline with seeded distributions, slope/height masks, exclusion zones and density budgets is not yet established end-to-end. |
| Visual QA / benchmark | P0 | PARTIAL | GLB/PBR validators, Blender quality reports, Playwright visual specs and runtime telemetry exist. Empty asset folders can be explicitly skipped; no committed hero GLB evidence or measured target desktop/mobile baseline is present. |

## Confirmed defect fixed in this audit

`blender/scripts/batch_export.py` previously selected only collection names beginning with `EXPORT_` when no collection filter was supplied. The later export loop contained a `COLLISION_` branch, but those collections never reached it in the default batch path.

The default collection selection now includes both `EXPORT_` and `COLLISION_`. This fixes the documented visual + collision batch-export contract. This source change still requires a Blender runtime test on a scene containing both collection types.

## Architecture decisions for completion

1. **Asset source of truth:** add a versioned registry separate from region placement. The registry describes an asset; region manifests place it in the world. Store stable ID, semantic type, tier, source .blend, GLB variants, LOD distances, collision/navmesh references, material/texture dependencies, bounds, triangle/texture budgets, content hash, version and acceptance state.
2. **PBR contract:** author Base Color, Metallic-Roughness (G=roughness, B=metallic), Tangent Normal and Occlusion. Keep correct sRGB/Non-Color settings. Validate exported glTF texture slots, not merely Blender node names. Do not call procedural noise output a scanned/photoreal texture.
3. **LOD contract:** LOD0/1/2/3 are available where useful, not mandatory for every asset. Hero focal assets may need authored LODs; small props may use one mesh; vegetation may use mesh LODs plus impostors/billboards at distance. Distances and hysteresis belong to asset metadata.
4. **Wind contract:** one world-space wind sample (direction, speed, gust, turbulence, time and quality budget) feeds vertex wind, branch bones, instance transforms, particle drift, water surface and eligible physics objects. Each receiver maps the shared field to its own response/stiffness.
5. **Simulation contract:** particle emitters own spawn/lifetime/pooling/budget; optional simulation modules own forces/collision. Physics Bridge applies the shared field to opted-in rigid bodies only. Visual-only foliage must not create unnecessary Rapier bodies.
6. **Water contract:** separate water surface optics from waterfall/foam/mist emitters. Use scene depth where available for shore fade/absorption; keep reflection/refraction disabled or simplified on low/mobile tiers.
7. **Quality tiers:** all expensive features resolve through one quality budget (ULTRA/HIGH/MEDIUM/LOW/MOBILE), with deterministic fallbacks and measured GPU/memory ceilings.
8. **Acceptance gates:** source lint/typecheck/unit tests → Blender batch runtime → Blender technical report → GLB strict validation → R3F visual inspection → target-device benchmark. Each gate must retain its own evidence.

## Delivery plan

### P0 — Asset production and integrity
- Fix and runtime-test visual + collision batch export.
- Add the versioned asset registry and schema validation; connect region placements by asset ID.
- Complete UV overlap and texel-density reports with per-tier policy.
- Complete the glTF PBR map contract, including metallic-roughness packing and true occlusion export.
- Run sculpt/retopology/UV/bake/export on one hero asset and one environment asset; do not label them accepted until reviewed.
- Make CI distinguish “no assets yet” from “assets validated”; keep empty-folder skips visible as skips.

### P1 — Real-time environment systems
- Consolidate wind calculations into a shared Wind Field API and add receiver adapters.
- Finish vegetation scatter with deterministic seeds, biome masks, exclusion zones, instance batching and distance tiers.
- Generalize the particle core from the existing smoke emitter.
- Upgrade water with depth-aware shoreline/absorption and quality-gated reflection/refraction.
- Complete LOD metadata/runtime behavior and post-process color grading; add regression visual scenes.

### P2 — Cinematic atmosphere and polish
- Add optional light shafts/local volumetric contribution with strict quality budgets.
- Calibrate lighting and atmosphere against approved scene captures.
- Add automated screenshot comparison and hardware benchmark reports for desktop and mobile.

## Acceptance checklist

- [ ] No destructive database, production, deployment or main-branch changes.
- [ ] Blender batch export produces both visual and collision GLBs from the same test scene.
- [ ] Every registered GLB has a stable asset ID, version and SHA-256 hash.
- [ ] Strict GLB validation passes for PBR maps, UVs, normals, texture sizes and geometry budgets.
- [ ] UV overlap and texel density reports are attached to the asset build.
- [ ] LODs have silhouette, shading and transition review; optional impostors are used only for appropriate distant assets.
- [ ] Runtime region loading resolves registry IDs and keeps collision/render roles separate.
- [ ] Wind receivers consume the same authoritative field sample.
- [ ] Particle/water systems respect quality budgets and clean up GPU resources.
- [ ] Visual QA includes named camera views, reproducible settings and comparison captures.
- [ ] FPS/frame-time p50/p95, draw calls, triangles, geometries, textures, GPU memory where available, and system RAM are recorded on target devices.

## Explicit non-claims

This audit does not claim that a cinematic hero asset has been created, that Blender scripts have run successfully, that the world is photorealistic, or that target-device performance has passed. The repository still needs real authored assets and runtime evidence.
