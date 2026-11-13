# Buddhist World — Asset Optimization Audit & A1–A6 Execution Plan

**Audit branch:** feature/phase1-foundation-hardening
**Audit baseline:** 504505e5bf18999d00875b19cd14f9aa97cd0115
**Scope:** procedural assets, GLB pipeline, asset registry, runtime loading, LOD, vegetation, terrain, water and VFX.
**Safety:** no database, backend protocol, production configuration, deployment, collision, navmesh or world-anchor changes.

## 1. Executive result

The repository contains procedural/blockout content and asset pipeline code, but no production Blender/GLB payloads to optimize. The production asset folders under apps/web/public/assets (models, textures, environments, characters, audio, fonts) and blender/assets (architecture, characters, environment, materials, props, textures, vegetation) contain only .gitkeep placeholders.

REGIONS.temple_complex.assets is empty and ASSET_REGISTRY.assets is empty. The default region is rendered by procedural geometry in TempleRegion.tsx. No registered production GLB currently exercises the generic static/vegetation LOD or instanced-GLB runtime path.

Do not interpret a prepared Blender generator, schema or runtime loader as a generated/accepted asset. Keep asset states separate: procedural base → technically validated → visually accepted → runtime accepted.

## 2. Asset-by-asset inventory

| Asset / source | Current state | Optimization state | Bottleneck / risk | Planned correction |
|---|---|---|---|---|
| Tam Quan — TempleRegion.tsx Gate | Procedural box/column/curved-roof meshes | Partially optimized: columns batched | Roof lacks tile geometry, ridge/end caps and carved details; no architecture LOD | A1: preserve silhouette/anchors; batch repeated trim; add LOD policy when real variants exist |
| Main Hall — TempleRegion.tsx MainHall | Procedural facade, columns, stairs and two roof tiers | Partially optimized: columns batched | Independent facade/trim meshes; no hero geometry or LOD | A1: batch repeated trim/material groups; define hero/environment budgets |
| Temple columns — TempleColumnBatch | Four InstancedMesh batches per structure; colliders separate | Structurally optimized | No distance simplification; detailed future columns need LOD | A1: retain independent collision; add visual LOD for registered GLBs |
| Roof surfaces — CurvedRoof / TempleProceduralGeometry | Procedural mesh, current calls use 40×22 segments | Partially optimized | Fixed tessellation at every distance; grayscale map reused as color/bump/displacement | A1: profile-aware tessellation; remove displacement on far tiers; defer authored tiles |
| Courtyard paving — CourtyardPath | 18 slabs + 2 borders in one InstancedMesh | Optimized structurally | One shared material; no distant simplification | A1: retain batch; add merged far variant only if measured |
| Procedural trees — ProceduralTree | 10 placements; near/mid/far/cull | Optimized structurally: near 3 draws, mid/far 2 | Low-poly silhouette, fixed species, transitions not visually accepted | A3: test transitions/wind; add species variants and impostor-ready far tier |
| Rocks + moss — ProceduralRockInstances | 7 placements in 2 InstancedMesh batches | Optimized structurally | One rock/moss shape reused; repeated silhouette | A2: deterministic shape/rotation/scale variation; add tiers if count grows |
| Grass patches — GrassPatch | 8 patches; density by quality, distance visibility, frustum culling | Partially optimized | Geometry rebuilds on quality change; no far impostor/merged cover; per-patch visibility check each frame | A3: stable density tiers, budgets, far ground cover and pop validation |
| Distant mountains — DistantMountain | 5 meshes | Not fully optimized | Fixed-resolution geometry; no explicit distance LOD | A2: near/mid/far mountain tiers and profile tessellation |
| Ground plane / terrain | 250×250 visual plane plus flat Rapier floor collider | Collision intentionally preserved | Flat playable surface; no streamed chunks, splat maps or terrain LOD | A2: visual-only chunks/material layering; do not alter collision/navmesh |
| Lotus pond — LotusPondWater / AnimatedWater | Quality-gated MeshReflectorMaterial and animated shader | Partially optimized | Reflection adds render pass; fixed 64-segment circle | A5: quality budget for resolution/blur/reflection and fallback shader |
| Waterfall — MountainRetreatWaterfall | Water sheet, foam, 120-point mist and rock dressing | Functional procedural effect, not fully optimized | Separate rock meshes; fixed particle count; no distance scaling; transparent overdraw | A5: instance rocks; scale mist/foam by quality and distance |
| Wet rocks — WaterSurface.tsx | Four wet-rock placements | Not batched | Separate meshes/material instances | A2/A5: batch compatible rocks; preserve weather-reactive material |
| Procedural surface maps — useSurfaceMaps | 5 noise + 5 normal DataTextures at 128² | Lightweight blockout maps | Same grayscale noise reused for color/bump/roughness roles; not production PBR sets | A1/A2: retain for blockout; authored base-color/normal/ORM maps when supplied |
| Static GLB props/architecture — RegionContent / StaticLodAsset | Generic runtime loader exists; no registered assets | Not exercised by current region | Three useGLTF calls load all three LOD sources when mounted; LOD selection does not itself stream memory | A1/A4: measure network/decoded/GPU memory; consider unified or staged loading after asset tests |
| GLB vegetation — VegetationLodAsset / InstancedVegetationAsset | Generic LOD/instancing code exists; no registered assets | Not exercised by current region | InstancedVegetationAsset rewrites every instance matrix on CPU each frame | A3: move per-instance wind to GPU or controlled cadence after profiling |
| NPC / character GLBs | Public character asset folder empty | Not assessable | No production character meshes/textures/LOD | A4: character-specific mesh/skeleton/material/animation budgets when assets arrive |
| Buddha statue / bell / incense burner | Names reserved in generate_hero_prop_lods.py | Pipeline placeholder only | No source mesh, UVs, texture sets or accepted LODs | A4: author high/medium/low variants and collision proxy |
| Bodhi hero tree / lotus ecosystem | generate_hero_vegetation.py procedural generator | Generator exists, not accepted runtime asset | Hero tree uses many separate objects/leaf cards; export batching and LOD unproven | A3/A4: consolidate by material/mesh, instance leaf clusters, validate exported GLB |
| Ground-cover scatter | generate_ground_vegetation.py | Generator exists; not runtime accepted | Geometry Nodes graph calls Realize Instances before output; may materialize scatter and undermine instance preservation during export | A2/A3: inspect evaluated geometry/GLB; remove realization only if exporter supports required instancing |
| Asset registry | packages/shared/src/assetRegistry.ts | Schema exists; registry empty | Budgets/metadata optional and not tied to generated manifest | A6: populate after assets exist; enforce measured budgets |
| Navmesh | Manifest references /assets/navmesh/temple_complex.json; validator tools/fixtures exist | Separate navigation data, not visual asset | Do not confuse navmesh with visual asset | Keep separate; no edits in this pass |

## 3. Cross-cutting bottlenecks

1. No production asset payloads: polygon, texture, compression, memory and download measurements are unavailable.
2. LOD is not memory streaming: all three GLB tiers are requested through useGLTF when a LOD component mounts.
3. CPU-side per-instance animation: InstancedVegetationAsset traverses batches and rewrites every instance matrix every frame.
4. Ground scatter export semantics: Geometry Nodes explicitly realizes instances; exported GLB size and draw-call behavior must be inspected.
5. Fixed procedural complexity: mountain/roof geometry and waterfall mist lack complete profile-aware distance tiers.
6. Visual acceptance missing: CI screenshots do not prove cinematic quality or physical-device performance.

## 4. A1–A6 implementation plan

### A1 — Architecture optimization
- Keep Tam Quan/Main Hall positions and collision anchors unchanged.
- Preserve column and paving instancing.
- Add profile-aware visual tessellation only where it cannot affect collision.
- Establish hero/environment budgets and LOD manifest acceptance checks.
- Defer tile/carving/ornament mesh optimization until authored meshes exist.

### A2 — Terrain & environment
- Add distance tiers for distant mountain geometry and quality-aware visual terrain detail.
- Keep flat collision floor and navmesh untouched.
- Batch compatible waterfall/wet rocks and vary rock transforms deterministically.
- Inspect terrain/ground-cover Blender exports before runtime registration.

### A3 — Vegetation completion
- Keep current procedural tree LOD and grass quality density.
- Audit LOD transition/wind behavior.
- Reduce CPU per-instance matrix work for future GLB vegetation after profiling.
- Validate Geometry Nodes scatter export semantics and batch by species/material.
- Add species diversity through actual asset/pipeline work, not placeholder claims.

### A4 — Hero assets & props
- Define source naming, scale, origin, UV, material, collision proxy and LOD contracts for Buddha statue, bell, incense burner, Bodhi tree and lotus.
- Keep generators as procedural bases, not visually accepted assets.
- Add LOD generation and validation when source meshes exist.

### A5 — Water & VFX
- Keep reflection disabled when the quality profile says so.
- Add distance/quality budgets for waterfall mist, foam and transparent layers.
- Batch compatible wet rocks and profile the pond reflection pass.
- Preserve shader/weather behavior and water placement.

### A6 — Global optimization & benchmark
- Extend benchmark reporting to include asset-level bytes, triangles, textures, draw calls and frame-time percentiles.
- Run browser QA for LOW/MOBILE, MEDIUM, HIGH and ULTRA.
- Run physical GPU benchmark on Windows; desktop MOBILE emulation is not a real phone test.
- Set pass/fail thresholds only after baseline measurements exist.

## 5. Execution gates

- No production deploy, database change, backend protocol change or destructive asset replacement.
- No change to region anchors, player movement, collision floor, Rapier colliders or navmesh.
- Source edits require typecheck/unit tests and relevant visual checks.
- Generated LOD ratios are not visual acceptance; inspect silhouette, normals, UV seams and material continuity.
- No performance improvement claim without benchmark evidence; structural draw-call reductions remain estimates.

## 6. CI context

Latest CI run 43399113739 for the audit baseline is still running. Unit tests, PBR/branch-rig validators, PostgreSQL/Redis integration tests, GLB/navmesh/NPC/collision validators, Blender script syntax and production builds completed successfully. Browser lighting visual QA was still in progress at audit time.
## 7. Source changes started after the audit

The following asset-independent optimizations have been committed on the audit branch. They are source changes, not yet visually or physically benchmark accepted:

- A1: Curved temple roofs now use quality-aware visual tessellation: ULTRA 40×22, HIGH 32×18, MEDIUM 24×12, LOW/MOBILE 16×8. Collision is untouched.
- A2: distant mountains now use three geometry LODs plus a cull tier; segment budgets and distance thresholds scale by quality. The root LOD and its geometry/material resources are disposed on replacement/unmount.
- A3: the future GLB instanced-vegetation path now refreshes CPU instance sway transforms at 30 Hz (ULTRA/HIGH), 24 Hz (MEDIUM), and 15 Hz (LOW/MOBILE), instead of rewriting every matrix on every rendered frame. Vertex-wind uniforms remain updated per frame; when wind stops, the base transforms are restored once.
- A5: waterfall mist point count now scales by quality: ULTRA 120, HIGH 96, MEDIUM 64, LOW/MOBILE 32.
- A6: added unit coverage for quality budgets. Existing browser and physical-GPU benchmark harnesses remain the measurement path.

Changed source: apps/web/src/game/world/assetQuality.ts, assetQuality.test.ts, TempleRegion.tsx, WaterSurface.tsx and InstancedVegetationAsset.tsx.

Not yet implemented/accepted: authored architecture/hero assets (A1/A4), real terrain/ground-cover export validation (A2/A3), rock batching and full VFX distance culling (A2/A5), production asset registry population, physical-device benchmark and final browser visual acceptance (A6).

CI must pass after these source changes before this batch is treated as validated.