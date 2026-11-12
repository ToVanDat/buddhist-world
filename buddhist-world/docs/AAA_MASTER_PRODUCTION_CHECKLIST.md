# AAA-Inspired Master Production Checklist — Buddhist World

**Audit snapshot:** 2026-11-12  
**Repository:** `ToVanDat/buddhist-world`  
**Audited branch:** `feature/phase1-foundation-hardening`  
**Audited PR head:** `35c7e8818f853785d77aae269f98222f1d14244b`  
**Target:** Hybrid quality — high-quality PC path with adaptive desktop/mobile fallback.  
**Audit mode:** Read-only source/tree/document inspection. No Blender process, local Windows workspace, browser runtime, physical GPU, or target mobile device was executed by this audit.

> This checklist is a production control document, not a claim that the listed work is complete. A source file, script, passing syntax check, or empty-folder-tolerant validator is not proof of an accepted asset or visual result.

## 1. Status vocabulary

- `NOT_STARTED`: no implementation/evidence found in the audited branch.
- `PLANNED`: documented design exists, but implementation is not evidenced.
- `SOURCE_PRESENT`: source code exists; runtime/visual acceptance is not established.
- `PARTIAL`: a working foundation exists, but required integration or quality gates are missing.
- `TOOLING_ONLY`: scripts/workflows exist; generated output has not been evidenced.
- `BLOCKED_BY_ASSET`: code exists but cannot be accepted without authored Blender/GLB assets.
- `BLOCKED_BY_DEVICE`: hardware/browser/runtime evidence is missing.
- `ACCEPTED`: all technical, visual, runtime, and performance evidence for the defined scope exists and has been reviewed.

No item may move to `ACCEPTED` solely because code compiles or CI passes.

## 2. Audited baseline — confirmed findings

### Repository facts
- The active development work is isolated in `feature/phase1-foundation-hardening`; PR #1 is Draft and targets `main`.
- The branch contains the monorepo: `apps/web`, `apps/server`, `packages/shared`, `blender`, `tools`, `docs`, and `.agents/skills`.
- The branch has Blender scripts for environment/architecture/hero props/vegetation generation, PBR baking, retopology starter work, batch export, lighting validation, and hero quality reporting.
- The branch has R3F systems for quality profiles, lighting/weather, wind, water, particles, post-processing, region assets, vegetation instancing/LOD, and runtime telemetry.
- The branch has project-specific agent skills for GLB asset pipeline, R3F engineering, shader/VFX, visual/performance QA, and world simulation.
- The audited Git tree contains no committed `.blend`, `.glb`, `.gltf`, `.fbx`, texture image, HDRI, or other authored binary art payload. Asset and export directories are placeholders. This statement applies to the audited branch tree; it does not prove that no untracked files exist on the user's Windows machine.
- The region manifest's temple asset list is empty and the blockout remains enabled.
- The project audit documents explicitly state that Blender scripts have not yet been run against final production assets and that no Hero asset has passed visual/runtime acceptance.
- Existing CI runs validators with `--allow-empty`; this proves validator execution, not that real GLBs were validated.
- The CI Blender job compiles Python syntax; it does not execute Blender or prove Blender API/runtime compatibility.
- The web quality profiles currently use DPR/shadow/AA/fog switches and initial device heuristics. This is not yet a complete measured GPU-capability tier resolver.
- Existing Playwright visual/performance tests and telemetry are useful foundations, but a physical-device benchmark and approved visual baselines remain necessary.

### Key existing source of truth
- `docs/ART_DIRECTION.md`
- `docs/CINEMATIC_ART_BIBLE.md`
- `docs/ASSET_RENDERING_SYSTEM_AUDIT.md`
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/PHASES_WITHOUT_BLENDER_ASSETS.md`
- `docs/BLENDER_PIPELINE.md`
- `docs/CINEMATIC_LIGHTING_ACCEPTANCE_2026-11-10.md`
- `blender/CINEMATIC_PIPELINE.md`
- `.agents/skills/*/SKILL.md`

## 3. Master production checklist A–N

Each row has a current source-audit status and an acceptance requirement. The status is conservative and does not imply work has been executed locally.

### A. Art direction, reference, and visual development

**Current status: PARTIAL**

- [ ] Establish one approved Art Bible as the single art-direction source of truth.
- [ ] Collect and approve reference boards for Vietnamese Buddhist architecture, Buddha iconography, temple props, vegetation, terrain, water, sky, and atmosphere.
- [ ] Define visual language by biome, region, time of day, season, and weather.
- [ ] Define asset tiers: Hero, Landmark, Midground, Background, Foliage/Scatter, Utility/Collision.
- [ ] Define material families and color palette: aged timber, lacquer, terracotta, limestone, bronze, stone, moss, water, foliage.
- [ ] Define camera/reference views and focal hierarchy for each region.
- [ ] Define cultural/art-direction review for religious statues, mudra, robe, iconography, inscriptions, and ornament.
- [ ] Approve representative target images before procedural replication.

**Existing evidence:** Art Direction and Cinematic Art Bible documents exist. The Art Bible is a temporary baseline because approved historical mockups/reference images are not available in the repository.

**Acceptance evidence:** approved reference board, versioned Art Bible, signed-off camera views, and a reference-to-render comparison sheet.

### B. Modeling, sculpting, and asset authoring

**Current status: TOOLING_ONLY / BLOCKED_BY_ASSET**

- [ ] Create high-quality Hero assets from approved briefs.
- [ ] Complete organic sculpt workflows: primary/secondary/tertiary forms, surface details, damage and wear.
- [ ] Complete hard-surface workflows: bevel control, supporting edges, clean shading, weighted normals and reusable modules.
- [ ] Create modular temple architecture with correct structural logic and culturally reviewed ornament.
- [ ] Create separate visual, collision, and navmesh representations.
- [ ] Author production vegetation species with believable trunk/branch/leaf structure and species variation.
- [ ] Keep procedural output as an editable base, not an automatic substitute for final art.
- [ ] Preserve source `.blend` files and deterministic generator inputs.

**Existing evidence:** hero architecture, hero props, Buddha sculpt workspace, vegetation, and cinematic environment generators exist. Their documentation labels outputs as procedural bases or requires artist work. No generated production `.blend` is present in the audited Git tree.

**Acceptance evidence:** source `.blend`, multi-angle close-ups, silhouette review, topology report, and artist approval for each Hero asset.

### C. Retopology, topology, deformation, and mesh integrity

**Current status: TOOLING_ONLY / PARTIAL**

- [ ] Define topology policies by asset class (static prop, deforming organic asset, foliage, architecture).
- [ ] Perform manual retopology cleanup after automated remesh/Quadriflow.
- [ ] Review edge flow, poles, non-manifold edges, normals, loose geometry, and degenerate faces.
- [ ] Validate deformation topology around joints and flexible branches.
- [ ] Define triangle budgets by tier and camera importance; do not use one universal polygon target.
- [ ] Validate mesh density against vertex-displacement needs.
- [ ] Add automated reports for silhouette/normal discontinuities where feasible.

**Existing evidence:** retopology starter script and hero quality gate exist. The gate reports technical properties; it explicitly cannot certify good topology or visual quality by itself.

**Acceptance evidence:** approved low-poly mesh, topology screenshots, automated report, and deformation test for animated assets.

### D. UV, texel density, baking, and texture preparation

**Current status: PARTIAL / TOOLING_ONLY**

- [ ] Define texel-density policy by Hero/Midground/Background tier and expected camera distance.
- [ ] Validate UV overlap, stretching, padding, degenerate UV triangles, and tileable/non-tileable use.
- [ ] Add a repeatable UV report and visual checker render.
- [ ] Run high-to-low bake on an approved source/target pair.
- [ ] Bake Base Color, Roughness, Metallic, Tangent Normal, and Occlusion where required.
- [ ] Validate color-space settings (sRGB versus Non-Color).
- [ ] Validate tangent basis and normal-map convention in Blender and Three.js.
- [ ] Preserve bake settings, source revision, output hashes, and bake logs.

**Existing evidence:** UV presence/range checks and Cycles bake scripts exist. UV overlap and texel-density reporting are incomplete. No accepted baked texture set is present in the audited tree.

**Acceptance evidence:** source/target `.blend`, baked map set, UV/texel-density report, bake log, and runtime material comparison.

### E. PBR materials, texturing, and surface response

**Current status: PARTIAL / BLOCKED_BY_ASSET**

- [ ] Establish strict glTF metallic-roughness export contract.
- [ ] Pack Metallic-Roughness correctly (G = roughness, B = metallic) where using the glTF combined texture.
- [ ] Connect true Occlusion texture to glTF occlusion slot; do not assume an AO image is exported because it exists in Blender.
- [ ] Validate Base Color, Metallic-Roughness, Normal, and Occlusion texture slots in exported GLB.
- [ ] Define PBR material families and calibrated ranges.
- [ ] Add hand-authored/painted details where procedural noise is insufficient.
- [ ] Add surface wear: scratches, chipped edges, dirt, moss, erosion, patina, stains, fingerprints and roughness variation.
- [ ] Validate texture resolution, mipmaps, compression, anisotropy, and memory budget.
- [ ] Distinguish scanned/photo-sourced textures from procedural textures in asset metadata.

**Existing evidence:** Principled material generators, procedural map generation, PBR policy tests, and Cycles baker exist. The source audit found a mismatch between separate authoring maps and the strict glTF texture contract; actual exported GLB slot wiring has not been accepted.

**Acceptance evidence:** exported GLB inspection, texture channel report, close-up material renders under neutral and cinematic lighting, and runtime validation.

### F. Environment, terrain, vegetation, and world building

**Current status: PARTIAL / BLOCKED_BY_ASSET**

- [ ] Build production terrain and landscape material layers.
- [ ] Create authored rock, cliff, soil, roots, fallen logs, debris, moss, grass, shrubs, trees, flowers, and ground-cover assets.
- [ ] Establish biome definitions and seeded scatter rules.
- [ ] Implement slope/height masks, exclusion zones, density limits, and path/architecture clearance.
- [ ] Define foreground/midground/background composition and distant silhouettes.
- [ ] Build modular temple compounds and region-specific dressing.
- [ ] Create deterministic environment scatter with reproducible seeds.
- [ ] Define region/chunk streaming, bounds, unload and memory eviction.
- [ ] Register only accepted assets in region manifests.

**Existing evidence:** procedural environment, temple, rock/vegetation, and scatter scripts exist. Region loading and instancing foundations exist. Final temple assets are not registered; blockout remains.

**Acceptance evidence:** approved region scene, asset scatter manifest/seed, multi-angle captures, GLB registry references, and runtime region-transition test.

### G. Lighting, atmosphere, sky, shadows, and reflections

**Current status: PARTIAL / BLOCKED_BY_ASSET**

- [ ] Calibrate exposure and color management with final PBR assets.
- [ ] Approve dawn/day/sunset/night lighting with consistent reference cameras.
- [ ] Implement sky gradient, sun/moon, horizon, atmospheric perspective, and weather response.
- [ ] Validate shadow cascades/ranges, bias, acne, peter-panning, softness, and contact grounding.
- [ ] Validate environment reflections and local reflection probes.
- [ ] Add quality-gated light shafts/local volumetric contribution where affordable.
- [ ] Calibrate architectural lights from actual fixture geometry and target direction.
- [ ] Validate fog density/range/color with real terrain and architecture.
- [ ] Add visual regression captures for each lighting/weather preset.

**Existing evidence:** lighting profiles, sky/atmosphere, architectural lights, fog, weather response, and lighting acceptance scripts exist. The 2026-11-10 screenshot audit found Dawn/Day/Sunset not accepted, Night only partial, and a visible unexplained light cone requiring tracing. Final scene tuning is blocked by missing production assets.

**Acceptance evidence:** approved captures for each preset, traced light fixtures, exposure/color chart, shadow/reflection review, and target-tier performance data.

### H. Rigging, character animation, vegetation animation, and secondary motion

**Current status: PARTIAL / BLOCKED_BY_ASSET**

- [ ] Create production character rigs and deformation-ready meshes.
- [ ] Validate Idle/Walk/Run/Jump and all required NPC activity clips.
- [ ] Review skinning, weights, joint deformation, foot contact, root motion, and retargeting.
- [ ] Create facial animation only where required by approved scope.
- [ ] Create branch/foliage deformation masks and species-specific stiffness.
- [ ] Validate branch-bone rig and vertex wind together without double deformation.
- [ ] Add secondary motion for cloth, hanging ornaments, bells, and flexible props where appropriate.
- [ ] Validate animation loops, transitions, and LOD behavior.

**Existing evidence:** monk blockout generator and GLB animation validation exist; branch-bone and vertex wind code/tests exist. No production-quality character/vegetation GLB has passed acceptance.

**Acceptance evidence:** real rigged GLB, animation preview, deformation report, clip inventory, and in-runtime review.

### I. VFX / FX and particle systems

**Current status: PARTIAL**

- [ ] Establish a general emitter API with spawn, lifetime, pooling, deterministic seed, events, and cleanup.
- [ ] Separate simulation state from rendering implementation.
- [ ] Add budgeted GPU particle path where supported and bounded CPU/instanced fallback.
- [ ] Author incense smoke, dust, pollen, falling leaves, petals, embers, fire, rain, mist, waterfall spray, and water splashes as distinct effects.
- [ ] Add camera/region culling and distance-based density.
- [ ] Control transparent overdraw, sorting, soft particles, depth interaction, and blending.
- [ ] Connect particle drift to the authoritative Wind Field.
- [ ] Add low/mobile reduced-cost fallbacks and reduced-motion handling.
- [ ] Validate effect timing, scale, density, color, and interaction with scene lighting.

**Existing evidence:** an instanced incense smoke primitive, rain, fog, waterfall mist/foam, and post-processing effects exist. The smoke primitive is explicitly a stylized approximation, not volumetric simulation. A general GPU particle framework is not evidenced.

**Acceptance evidence:** effect reference sheets, emitter configs, runtime captures, shader compilation checks, particle budgets, and performance measurements.

### J. Unified wind, water, weather, and environmental simulation

**Current status: PARTIAL**

- [ ] Publish one authoritative per-frame/world Wind Field snapshot.
- [ ] Include direction, speed, strength, gust, turbulence, time, and quality budget.
- [ ] Connect vertex wind, branch bones, instanced foliage, particles, water, and eligible physics receivers to the same sample.
- [ ] Define per-species/per-material response profiles (root, trunk, branch, foliage).
- [ ] Prevent double wind application between rig and shader.
- [ ] Implement water depth/shoreline absorption, refraction strategy, flow maps, foam, ripples, and reflection budgets.
- [ ] Connect rain to wetness, puddles, ripples, and surface response.
- [ ] Define weather transition interpolation and deterministic testing.
- [ ] Validate weather and simulation at every quality tier.

**Existing evidence:** shared deterministic Wind Field resolver, vertex wind, branch-bone wind, vegetation wind, weather lighting, rain, wet material response, and water shaders exist. The audit finds that water, particle drift, and physics are not all wired to the shared field; there is no single frame-level published snapshot. Water optics remain partial.

**Acceptance evidence:** same-frame receiver telemetry/debug visualization, synchronized wind test scene, water reference captures, and tiered runtime benchmark.

### K. Physics, collision, interaction, and simulation bridge

**Current status: PARTIAL**

- [ ] Keep authoritative gameplay physics separate from cosmetic presentation.
- [ ] Define collision layers/groups and collision asset contract.
- [ ] Validate scale, transforms, collider shape, navmesh, and spawn bounds.
- [ ] Add optional physics receivers for selected cloth/rope/rigid props only.
- [ ] Connect wind/forces to eligible physics objects through a controlled bridge.
- [ ] Define fixed timestep, interpolation, sleep, and simulation LOD.
- [ ] Test stairs, slopes, seams, obstacles, moving interactions, and region boundaries.
- [ ] Keep foliage and distant environment objects out of unnecessary rigid-body simulation.
- [ ] Validate collision GLB separately from visual GLB.

**Existing evidence:** Rapier player/collision integration, collision GLB and navmesh validators, and gameplay interaction systems exist. A generalized environment Physics Bridge and broad environmental physics acceptance are not evidenced.

**Acceptance evidence:** collision asset reports, deterministic physics tests, representative interaction captures, and multiplayer/region integration tests.

### L. Shader architecture and advanced rendering

**Current status: PARTIAL**

- [ ] Document shader ownership, shared uniforms, color space, tone mapping, and material conventions.
- [ ] Establish shader variants by quality tier and capability.
- [ ] Add robust foliage, water, terrain, wet-surface, decal, and atmosphere shader acceptance scenes.
- [ ] Validate normals/tangents after vertex displacement.
- [ ] Add shader compilation and fallback tests.
- [ ] Profile full-screen passes, transparency, reflections, shadows, and shader complexity.
- [ ] Define WebGPU implementation path only after capability detection and parity testing.
- [ ] Preserve WebGL fallback; avoid assuming WebGPU is universally available.
- [ ] Validate visual parity and graceful fallback between rendering backends.

**Existing evidence:** custom GLSL/Three.js shader systems for wind, water, fog, particles, and post-processing exist. The audited tree shows WebGL-oriented tests; a complete WebGPU backend and parity suite are not evidenced.

**Acceptance evidence:** shader test scenes, compile logs, visual comparison, backend capability report, and GPU timing.

### M. Runtime engine, streaming, and hybrid quality system

**Current status: PARTIAL / BLOCKED_BY_DEVICE**

- [ ] Define capability detection using actual WebGPU/WebGL support, GPU renderer class where available, memory limits where available, viewport/DPR, and measured frame time.
- [ ] Resolve one central quality budget for DPR, shadows, fog, reflections, particles, vegetation, post-processing, texture sizes, and streaming.
- [ ] Support ULTRA/HIGH/MEDIUM/LOW/MOBILE with deterministic feature fallbacks.
- [ ] Add hysteresis and cooldown to adaptive quality to avoid oscillation.
- [ ] Add GPU resource lifecycle and disposal on region unload.
- [ ] Complete chunk/region streaming, preload, cancellation, and eviction.
- [ ] Implement asset registry lookup by stable ID/version/hash; separate asset definition from region placement.
- [ ] Support texture compression and mesh compression only after browser compatibility validation.
- [ ] Test browser/device capability matrix and context loss/recovery.
- [ ] Verify accessibility and reduced-motion settings for camera/VFX.

**Existing evidence:** R3F renderer, region-scoped asset mounting, static/vegetation LOD, runtime performance telemetry, and five named quality profiles exist. Quality detection currently relies on touch/hardware concurrency heuristics; a measured capability resolver, complete adaptive budget, and production streaming lifecycle remain incomplete.

**Acceptance evidence:** capability matrix, quality transition logs, region load/unload tests, memory telemetry, and target desktop/mobile browser sessions.

### N. Optimization, visual QA, and release acceptance

**Current status: PARTIAL / BLOCKED_BY_DEVICE / BLOCKED_BY_ASSET**

- [ ] Define budgets per asset tier: triangles, materials, draw calls, texture dimensions/memory, animation bones, and collision complexity.
- [ ] Define budgets per scene/region: visible objects, instances, lights, shadow casters, particles, transparent pixels, render passes, and memory.
- [ ] Measure frame time p50/p95/p99, CPU/GPU time where available, draw calls, triangles, textures, geometries, load time, and network payload.
- [ ] Benchmark a physical high-end PC, mid-range PC, integrated GPU, and representative mobile devices.
- [ ] Capture deterministic reference views: establishing wide shot, approach, architecture detail, Hero asset, vegetation, water, night, and weather.
- [ ] Compare visual changes against approved references and prior baselines.
- [ ] Preserve screenshot, browser console, shader errors, telemetry JSON, asset reports, and commit/asset revision.
- [ ] Run source tests, Blender runtime tests, strict GLB tests, R3F visual tests, and device tests as separate gates.
- [ ] Distinguish CI smoke tests from real hardware benchmark.
- [ ] Require manual art review before visual acceptance.
- [ ] Require release report with PASS/FAIL/BLOCKED and untested conditions.

**Existing evidence:** GLB/navmesh/branch-rig validators, Blender quality reports, Playwright visual specs, screenshot QA route, and performance telemetry exist. Empty asset folders may be skipped by CI; physical device and production asset acceptance remain outstanding.

**Acceptance evidence:** reproducible QA report, screenshot bundle, benchmark JSON, hardware/browser details, test logs, and explicit reviewer approval.

## 4. Cross-cutting production controls

- [ ] Versioned Asset Registry is the source of truth for asset identity, source file, outputs, hashes, dependencies, LODs, budgets, and acceptance state.
- [ ] Region manifests reference stable asset IDs rather than duplicating asset metadata.
- [ ] Each asset has a source `.blend`, staged GLB outputs, textures, metadata, QA reports, and preview captures.
- [ ] Generator scripts are deterministic and do not overwrite authored sources.
- [ ] All destructive Blender operations require explicit output paths and preserve source files.
- [ ] CI reports empty asset folders as SKIPPED, never as successful asset acceptance.
- [ ] Runtime quality settings are centralized; no competing per-component quality decisions.
- [ ] Every feature has an owner, configuration schema, tests, debug view, performance budget, and fallback.
- [ ] Changes are made on feature branches and reviewed through PR.
- [ ] No database migration, deployment, secret change, or production mutation is part of visual asset work without separate explicit approval.

## 5. Hybrid target policy

The target is not “maximum settings on every device.” It is a scalable visual contract:

| Tier | Target role | Policy |
|---|---|---|
| ULTRA | High-end desktop / capable GPU | Highest approved texture, shadow, reflection, fog, particle and post-process settings within measured frame budget |
| HIGH | Mid/high desktop | High material/lighting fidelity with reduced expensive passes and bounded shadow distance |
| MEDIUM | Mainstream laptop / integrated GPU | Lower DPR, shadow resolution, foliage density, reflection and particle counts |
| LOW | Low-end desktop | Disable or simplify expensive effects; preserve silhouette, material readability and stable interaction |
| MOBILE | Supported mobile browser | Tight DPR, memory, draw-call, transparency and thermal budgets; reduced VFX and streaming footprint |

Do not set final numerical budgets until representative hardware benchmarks exist. Initial values must be labelled provisional, then replaced by measured budgets.

## 6. Required acceptance pipeline

1. **Brief and reference approval** — asset purpose, tier, views, art direction, cultural review.
2. **DCC authoring** — source scene and reproducible settings.
3. **Technical asset QA** — mesh, UV, topology, material graph, transforms, bounds.
4. **Bake and export** — staged outputs; source files remain untouched.
5. **Strict GLB QA** — texture slots/channels, animations, bounds, compression, triangle/texture budgets.
6. **Blender visual review** — neutral and art-directed lighting, close-up and silhouette views.
7. **Runtime integration** — actual R3F scene, collision, animation, wind, and LOD.
8. **Visual acceptance** — compare against approved reference views.
9. **Hybrid performance QA** — desktop high-end, mid-range, integrated, mobile.
10. **Promotion** — only then update production registry/region manifest.

## 7. Delivery roadmap

### P0 — Audit closure and production proof
- [ ] Verify the local Windows branch/head matches the audited GitHub head.
- [ ] Run Blender version/add-on/MCP/bridge checks on the actual machine.
- [ ] Execute existing Blender scripts in an isolated copy and capture outputs.
- [ ] Choose one Hero asset and one representative environment slice as production pilots.
- [ ] Complete strict PBR/UV/bake/export contract.
- [ ] Add versioned Asset Registry and connect manifest placements to asset IDs.
- [ ] Make empty-asset CI status explicitly SKIPPED.
- [ ] Establish approved camera/reference and visual QA baseline.

### P1 — Real-time cinematic systems
- [ ] Consolidate Wind Field into one frame-level snapshot and connect all receivers.
- [ ] Complete vegetation response, deterministic biome scatter, and LOD.
- [ ] Generalize particle lifecycle and budgets.
- [ ] Complete water depth/shoreline/refraction strategy and quality fallbacks.
- [ ] Calibrate lighting, sky, shadow, exposure, and color grading against final assets.
- [ ] Complete character/prop animation acceptance.

### P2 — Hybrid runtime and world scale
- [ ] Implement capability-driven quality resolver and adaptive hysteresis.
- [ ] Complete region/chunk lifecycle, resource disposal, preload and eviction.
- [ ] Add WebGPU path only with tested WebGL fallback and parity.
- [ ] Complete GPU/CPU performance budgets on target devices.
- [ ] Add large biome/world production and streaming validation.

### P3 — Advanced polish
- [ ] Add selective local volumetrics/light shafts.
- [ ] Improve reflections, water optics, decals, weather interaction, and advanced surface effects.
- [ ] Add advanced animation/secondary motion and optional physics interactions.
- [ ] Add visual/performance regression tracking to the release process.

## 8. First pilot asset acceptance card

Use one Bodhi tree or one other approved Hero vegetation species as the first full-pipeline pilot.

- [ ] Approved species reference and silhouette sheet.
- [ ] Artist-reviewed trunk, roots, branches, crown, and leaf structure.
- [ ] High-poly/source scene preserved.
- [ ] Low-poly/deformation mesh approved.
- [ ] UV/texel density/overlap report.
- [ ] Base Color, Metallic-Roughness, Normal, Occlusion contract verified in exported GLB.
- [ ] Bark/leaf PBR reviewed in neutral and cinematic lighting.
- [ ] Wind masks/profile and deformation reviewed (root fixed, trunk subtle, branch/foliage responsive).
- [ ] LODs reviewed for silhouette and transition.
- [ ] GLB strict validation passed.
- [ ] Runtime scene integration passed.
- [ ] High/medium/low/mobile captures and performance measurements attached.
- [ ] Asset Registry entry promoted to `ACCEPTED` only after all evidence is reviewed.

## 9. Audit limitations and next verification

This audit used the GitHub branch source tree, project documents, source files, and PR description. It did not inspect local untracked files, execute commands on the user's Windows computer, open Blender, render the source scenes, run the browser game, or benchmark physical devices.

The next verification step is to compare the user's local branch/head and untracked asset directories with this GitHub snapshot, then run the Blender/DCC and browser acceptance stages in isolated staging outputs. Until then, statuses marked PARTIAL, TOOLING_ONLY, BLOCKED_BY_ASSET, or BLOCKED_BY_DEVICE must remain unchanged.
