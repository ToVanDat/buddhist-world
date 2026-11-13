# Buddhist World — AAA-01 → AAA-06 execution record

**Branch:** `feature/phase1-foundation-hardening`  
**Direction:** Full scope · Hybrid Blender/procedural/R3F · Cinematic target  
**Safety boundary:** visual/render/asset pipeline only. No changes to Rapier collision definitions, navmesh data or path, world anchors/spawns, backend, database, production environment or deployment.

## Executive audit

The source has a working browser runtime and asset-authoring foundation, but the repository still does not contain accepted production hero/environment GLBs. The temple region currently has an empty `assets` manifest and the shared asset registry is intentionally empty. Blender generators and export/validation scripts are tools, not proof that their output assets exist or have passed visual acceptance.

Existing systems retained:
- Procedural temple blockout, instanced columns/paving, procedural vegetation and quality-tiered LOD.
- Weather-aware materials, environment lighting, cinematic post-processing, water and waterfall effects.
- GLB region loader, static/vegetation LOD components, Blender export scripts and GLB/PBR validation.
- Existing world anchors: Tam Quan `(0,0,20)`, courtyard `(0,0,0)`, Main Hall `(0,0,-22)`, lotus pond `(-18,0,4)`.

## AAA-01 — Architecture & geometry

**Source status:** procedural blockout; partial instancing and profile-aware roof tessellation already exist. No production temple mesh, roof tile set, ridge ornaments, carved beams, brackets or accepted facade detail payloads.

**Implemented in this pass:** introduced asset-class budgets as machine-checkable acceptance policy; retained existing procedural architecture and all collision anchors. Hero and environment geometry must be authored as separate visual variants and validated before registration.

**Still requires Blender art:** high/medium/low Tam Quan and Main Hall meshes, tile/ridge/eave modules, carved beam/bracket details, UVs and clean material slots.

Acceptance: silhouette review at near/mid/far distances; no z-fighting; normals/UVs valid; LOD silhouette stable; no visual mesh is silently treated as collision.

## AAA-02 — PBR materials & surfaces

**Source status:** procedural noise/normal maps and weather-reactive physical materials exist. These are useful blockout materials, not production texture sets. The same grayscale noise must not be mistaken for authored base-color, roughness, AO and normal maps.

**Implemented in this pass:** asset budget policy includes texture dimension limits; strict GLB validation remains the material/UV gate. The new budget policy is opt-in so existing asset validation behavior is not silently tightened.

**Still requires Blender art:** authored Base Color, Tangent Normal, Roughness and AO (or packed ORM) maps; consistent texel density; correct color-space assignment; texture atlasing and KTX2/Basis conversion where supported by the runtime pipeline.

Acceptance: no missing UV0/normals; PBR material review under day/dawn/sunset/night and wet weather; no over-metallic wood/stone; texture dimensions and package size within class budget.

## AAA-03 — Environment & vegetation

**Source status:** procedural trees have near/mid/far/cull tiers; grass density scales by quality; instanced vegetation CPU updates are throttled. Mountain LOD and waterfall mist quality tiers exist. Repeated rock/canopy silhouettes and lack of authored species remain visible limitations.

**Implemented in this pass:** a vegetation budget class and repository asset-readiness audit were added. Existing wind, LOD and instancing systems remain in place.

**Still requires Blender art:** distinct Bodhi, banyan and willow silhouettes; leaf clusters/branch hierarchy; rock species; ground-cover clusters; reviewed far impostors; real export tests proving instances remain batched.

Acceptance: no obvious LOD popping; stable wind phase; no excessive alpha overdraw; draw calls and triangle count measured on physical GPU.

## AAA-04 — Hero assets

**Source status:** authoring scripts exist for Buddha statue, bell, incense burner, Bodhi tree and lotus, but no accepted production payloads are present in the asset folders. The hero asset LOD generator explicitly marks decimated output as requiring visual review.

**Implemented in this pass:** explicit hero budget class and an asset inventory report that distinguishes source presence from accepted runtime status.

**Still requires Blender art:** high-poly sculpt, retopology, UVs, bake maps, material authoring, LODs, pivots/origins and final GLB review. Auto-decimation is only a starting point and must not be accepted without silhouette/normal inspection.

Acceptance: asset-specific visual review, LOD transition review, correct scale/origin, no hidden modifiers, validated PBR and measured memory/download cost.

## AAA-05 — Cinematic presentation

**Source status:** ACES filmic tone mapping, sky/fog, day-cycle lighting, bloom, vignette, optional depth of field and volumetric fog already exist. Quality tiers gate several expensive effects. This is a functioning presentation base, not proof of final cinematic art direction.

**Implemented in this pass:** added a restrained warm-neutral color-grade shader pass for ULTRA/HIGH only, with a tested resolver. Existing ACES, bloom, vignette, DOF and fog remain intact; lower quality tiers receive no extra grading pass. This is a controlled art-direction starting point, not final screenshot acceptance.

**Still requires visual QA:** matched camera shots for dawn/day/sunset/night, rain and fog; exposure checks on dark scenes; highlight clipping, bloom restraint, color consistency and composition review on desktop and mobile.

Acceptance: screenshots from real browser/GPU, consistent exposure and readable silhouettes; no effect-induced blur or bloom that obscures gameplay.

## AAA-06 — Runtime optimization & acceptance

**Source status:** quality profiles, LOD, instancing, performance telemetry and GLB validation exist. Static/vegetation GLB LOD components currently call `useGLTF` for all three variants, so distance LOD must not be described as network/memory streaming.

**Implemented in this pass:** added reusable asset-class budgets, tests for the policy, and a read-only asset-readiness audit command. Budgets are opt-in and do not block existing builds until actual payloads are reviewed.

**Still requires runtime evidence:** GLB download/decoded/GPU memory measurements; KTX2/Meshopt pipeline decision; staged loading/streaming design; per-profile browser benchmarks on physical hardware; visual LOD transition tests.

Acceptance: all registered assets have provenance, checksum, byte size, triangle count, texture size and accepted LOD metadata; HIGH/ULTRA and LOW/MOBILE tested on physical devices; no regression to collision/navmesh/gameplay.

## Commands

```bat
pnpm audit:assets
pnpm test:asset-budgets
pnpm validate:glb -- apps/web/public/assets --strict-pbr
pnpm validate:glb -- path\to\hero.glb --strict-pbr
```

The audit command is read-only. It reports absent assets; it does not create placeholders, edit manifests, register GLBs or alter navigation/gameplay data.

## Status and honest completion boundary

- **Source/pipeline readiness:** improved and partially implemented.
- **Production art readiness:** blocked until Blender source scenes and reviewed GLBs/textures are supplied or authored.
- **Cinematic visual acceptance:** pending browser screenshots and physical GPU review.
- **AAA claim:** not accepted until AAA-01 through AAA-06 acceptance evidence is attached per asset and per target quality tier.
