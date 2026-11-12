# Hybrid World Production Architecture

**Project:** Buddhist World  
**Branch:** `feature/phase1-foundation-hardening`  
**Baseline reviewed:** 2026-11-12  
**Status:** Architecture and production contract; implementation is incremental and evidence-gated.

## 1. Decision

Adopt an **AI-orchestrated, artist-led, procedural-assisted, script-automated asset pipeline** feeding a **Three.js / React Three Fiber runtime** and a **React/HTML player experience**.

This is a hybrid content-production architecture, not a replacement of the current application stack. Extend existing systems rather than creating parallel registries, exporters, world manifests, or rendering engines.

Core principles:

- Artists own visual direction and final approval of culturally important and close-up assets.
- Procedural generation owns repeatable, parameterized variation and large-scale distribution.
- AI accelerates reference analysis, ideation, texture/model drafts, code assistance and QA triage; AI output is never automatically production-approved.
- Scripts make builds reproducible, validate artifacts and publish only accepted outputs.
- Three.js/R3F owns real-time 3D presentation and interaction.
- React/HTML owns conventional application and player-facing UI; it must not duplicate the 3D renderer.
- Every production claim must be backed by an artifact, automated report and/or recorded visual/runtime review.

## 2. Audited baseline (source evidence)

The following are present on the reviewed branch:

| Area | Evidence | Baseline disposition |
|---|---|---|
| Workspace | `package.json`, `pnpm-workspace.yaml`, `apps/web`, `apps/server`, `packages/shared` | Source present |
| Blender tooling | `blender/scripts/` contains generators, baking, LOD, export and validation scripts | Tooling present; runtime output not proven |
| Blender agent integration | `.agents/skills` exists; no verified Blender MCP server configuration or successful DCC round-trip was established by this audit | Not verified |
| Asset identity | `packages/shared/src/assetRegistry.ts` with Zod schemas and validation | Schema present; registry empty |
| World placement | `packages/shared/src/regions.ts` | One `temple_complex` region; `assets: []`; `blockout: true` |
| R3F runtime | `apps/web/src/game/world`, `rendering`, `lighting`, characters and multiplayer modules | Runtime systems present; production content integration incomplete |
| Art direction | `docs/ART_DIRECTION.md`, `docs/CINEMATIC_ART_BIBLE.md` | Direction documented |
| Existing pipeline docs | `docs/BLENDER_PIPELINE.md`, `blender/CINEMATIC_PIPELINE.md` | Partial pipeline documented |
| Real asset outputs | Previous Git-tree audit found no committed final `.blend` or `.glb` outputs in the expected production folders | Asset acceptance blocked |
| Runtime/performance | CI has source/build and selected visual checks; target-device and sustained multiplayer evidence remain outstanding | Not production-accepted |

This is a Git source audit, not a scan of untracked files on a developer workstation. Re-run local inventory before concluding that no local assets exist.

## 3. Target architecture

```text
Creative direction / art bible / cultural review
                    |
             AI orchestration
       (briefs, references, drafts, QA triage)
                    |
       +------------+-------------+
       |            |             |
 Artist-led      Procedural    AI-assisted
 Blender DCC     Blender/GN    concept/texture/
 hero assets     environment   mesh/animation drafts
       |            |             |
       +------------+-------------+
                    |
          Blender Python pipeline
    normalize -> validate -> bake -> LOD
    collision/navmesh -> export -> optimize
                    |
             Artifact QA gates
       GLB / PBR / animation / collision
          visual review / runtime review
                    |
         Asset Registry (identity/version)
                    |
        Region/World Manifest (placement)
                    |
        Three.js + React Three Fiber
 rendering / streaming / animation / physics /
       lighting / weather / VFX / multiplayer
                    |
          React + HTML player experience
      HUD / inventory / social / chat / quests
```

### Ownership boundaries

- **Blender:** source-of-truth DCC for authored geometry, UVs, material authoring, rigs, animation, collision proxies and authored navmesh surfaces.
- **Procedural systems:** deterministic geometry and placement generated from versioned parameters and seeds. Output remains editable in Blender where appropriate.
- **AI services/agents:** propose or assist; they do not write directly into accepted asset locations or bypass validation.
- **Python/CLI automation:** deterministic orchestration and artifact production. A run must record tool versions, source file, parameters, seed, output paths and validation result.
- **Asset Registry:** asset identity, version, source lineage, variants, dependencies, budgets and acceptance state.
- **Region manifest:** placement, transforms, instances, spawn points and region bounds. It references registered asset IDs; it must not become a second asset metadata database.
- **R3F runtime:** loads accepted runtime variants and manages real-time scene behavior.
- **React UI:** application/player interface outside the 3D scene. In-world 3D controls remain scene components.

## 4. Asset tiers and production method

| Tier | Examples | Primary method | Approval |
|---|---|---|---|
| HERO | Principal Buddha statue, main hall, Tam Quan, landmark bridge/tree | Manual Blender sculpt/model + AI references + selective procedural modules | Artist + cultural + visual + runtime |
| ENVIRONMENT | Secondary halls, walls, paths, rocks, garden structures | Modular Blender + procedural variants | Visual + runtime |
| VEGETATION | Hero trees, forest, lotus, grass | Hand-authored hero specimens + Geometry Nodes/scatter variations | Silhouette + biome + performance |
| PROP | Bells, incense burners, lanterns, furniture | Manual or procedural base depending on uniqueness | Material + scale + interaction |
| CHARACTER | Player and NPCs | Manual topology/rigging + AI-assisted concept/motion where useful | Deformation + animation + runtime |
| EFFECT | Smoke, rain, fireflies, weather | Shader/particle/procedural systems | GPU budget + visual |
| TERRAIN | Hills, paths, shorelines, cliffs | Procedural base + sculpted art direction | Navigation + silhouette + streaming |

Do not spend hero-level geometry budgets on distant background objects. Do not use procedural repetition for culturally significant focal pieces without deliberate art direction.

## 5. Canonical asset lifecycle

1. **Brief:** assign stable asset ID, tier, intended camera distance, scale, cultural/context constraints and target platform.
2. **Reference:** record reference provenance and license; AI may help summarize references or produce concept drafts.
3. **Blockout:** validate silhouette, dimensions, pivot, interaction envelope and composition.
4. **Author:** manual Blender, procedural Blender, or hybrid workflow. Preserve editable source `.blend` and generation parameters.
5. **Technical preparation:** apply transforms, establish Y-up export contract, UV unwrap, texel-density check, material authoring, bake and texture packing.
6. **Variants:** create justified visual LODs, collision proxy, navmesh surfaces and optional impostor. Do not create variants without runtime need.
7. **Export:** batch export deterministic GLB artifacts with stable names.
8. **Optimize:** apply supported mesh/texture compression only after decoder support is verified in the web runtime.
9. **Validate:** run asset, texture, animation, PBR, GLB, collision and navmesh checks applicable to the asset.
10. **Visual review:** inspect source scene, exported GLB and in-game appearance under approved lighting/camera conditions.
11. **Register:** add immutable versioned record, hashes, sizes, triangle/texture budgets, dependencies and variant URIs.
12. **Place:** reference the registry ID from a region manifest and specify transforms/instances.
13. **Runtime acceptance:** verify loading, animation, collision, interaction, LOD transitions, memory and frame pacing on target devices.
14. **Release:** promote acceptance state only when evidence is attached. Keep previous accepted versions available for rollback.

### Acceptance-state meaning

Use the existing registry states consistently:

- `DRAFT`: brief or source work exists.
- `PROCEDURAL_BASE`: generated/authored base exists but is not production validated.
- `TECHNICALLY_VALIDATED`: applicable automated checks pass.
- `VISUALLY_ACCEPTED`: an identified reviewer inspected the exported asset and approved it.
- `RUNTIME_ACCEPTED`: integrated runtime behavior and target performance evidence pass.

A script existing, syntax compiling, or an empty-folder validator exiting successfully never promotes an asset.

## 6. Pipeline contracts

### Source and output layout

Keep the existing folder layout and formalize its meaning:

- `blender/projects/`: editable source scenes; never overwrite user-authored source as a side effect.
- `blender/assets/`: reusable authoring libraries and source components.
- `blender/references/`: licensed references and approved concept material with provenance.
- `blender/scripts/`: deterministic generators, validators, exporters and orchestration.
- `blender/exports/`: generated staging artifacts, separated by category/region/version.
- `apps/web/public/assets/`: only runtime-ready published assets.
- `packages/shared/src/assetRegistry.ts`: runtime-facing registry schema and validated registry data.
- `packages/shared/src/regions.ts`: world placement and region manifest.

Generated output must not silently overwrite source files. Use explicit output paths and an opt-in overwrite flag.

### Export contract

Every visual GLB must have:
- stable asset ID/version and reproducible source lineage;
- applied transforms and documented Y-up/metre convention;
- valid normals, UVs and supported material channels;
- external dependencies packed or explicitly referenced according to the project policy;
- measured triangle count, texture dimensions/bytes and file size;
- no missing textures or unsupported shader nodes;
- validated animation clips/skin when applicable.

Collision GLBs must be separate, static, simplified, untextured and free of animation/skin data. Prefer primitive Rapier colliders for simple shapes. Navmesh is authored walkable geometry, not a copy of the render mesh.

PBR channel packing and glTF export behavior must be proven by inspecting actual exported GLBs in the target loader. In particular, verify metallic-roughness channel packing and glTF occlusion texture wiring; do not infer correctness from Blender node names alone.

### Compression contract

Do not enable Meshopt/KTX2 in production builds until the matching decoders/transcoders are configured and a real compressed GLB has passed browser tests. Do not apply Draco and Meshopt redundantly to the same geometry. Keep an uncompressed staging artifact for diagnosis.

## 7. Blender DCC and AI agent integration

Blender MCP is an optional control plane, not a required runtime dependency.

Target interaction model:

- Chat/AI agent sends a typed task or command to a local agent bridge.
- The bridge validates the task against an allowlisted operation set.
- A Blender-side MCP/add-on or background Blender process performs the operation.
- The bridge returns structured results, logs, output file paths and screenshots/renders.
- The normal Python pipeline validates the resulting artifacts.
- Only an explicit publish step can move accepted artifacts into runtime asset locations.

Safety and reliability requirements:

- Keep Blender local to the workstation; do not expose an unauthenticated MCP port to the public Internet.
- Restrict filesystem access to the project workspace and approved output directories.
- Require explicit confirmation for overwrite, deletion, external downloads and publishing.
- Make generation idempotent where practical and write to a new output file by default.
- Log Blender version, add-ons, script revision, parameters, seed and duration.
- Support both interactive Blender control and headless batch generation; neither mode should depend on the other.
- If MCP is unavailable, scripts and CLI remain fully usable.

Current status: repository has agent skills and Blender scripts, but a working Blender MCP connection and an end-to-end DCC round-trip have not been verified. Do not mark the agent integration complete until a test task creates a disposable scene, saves a new file, renders a preview and returns verifiable output paths without modifying the source scene.

## 8. Realtime runtime responsibilities

Three.js/R3F remains responsible for:
- region scene composition and accepted asset loading;
- frustum/distance culling, instancing and LOD selection;
- character animation and interaction;
- Rapier collision/physics;
- lighting, weather, water and VFX;
- audio spatialization and camera;
- network interpolation and multiplayer presentation.

React/HTML remains responsible for:
- account/session and navigation UI;
- HUD, settings, inventory, quest and social panels;
- chat, notifications and accessible forms;
- responsive layouts and keyboard/focus behavior.

Do not put per-frame transforms into React state. Use mutable Three.js objects/frame callbacks for high-frequency updates and Zustand for sparse UI/network state, consistent with the existing architecture.

World expansion should proceed through bounded region packages and explicit streaming/eviction policies. Do not interpret a large region AABB as proof that world partitioning or streaming is implemented.

## 9. AI use policy

AI may:
- analyze reference packs and produce asset briefs;
- draft concept art and material/texture candidates;
- propose Blender Python or Geometry Nodes configurations;
- assist retopology, rigging and animation cleanup;
- classify validator failures and summarize visual QA findings.

AI must not:
- approve its own output as visually or culturally correct;
- invent asset licenses or provenance;
- silently alter the asset registry or region manifest;
- publish files directly into production runtime paths;
- run arbitrary shell/file operations through an unrestricted agent;
- generate final sacred/cultural iconography without human review.

All AI-produced artifacts remain `DRAFT` or `PROCEDURAL_BASE` until normal gates pass.

## 10. Implementation roadmap and exit criteria

### P0 — Production foundation
- [ ] Document and enforce stable asset ID, version and source-lineage convention.
- [ ] Add a registry document loader/validator to CI; fail when a published manifest references an unknown ID or missing runtime variant.
- [ ] Define a registry-to-region placement contract without duplicating metadata.
- [ ] Close PBR/glTF metallic-roughness and occlusion export verification using real fixtures.
- [ ] Add strict non-empty production validation mode; retain explicit optional mode for source-only CI.
- [ ] Add deterministic pipeline run manifest (tool versions, inputs, parameters, seed, outputs, validation reports).
- [ ] Verify Blender headless generation/export against a real disposable scene.
- [ ] Verify local Blender MCP round-trip separately from headless pipeline.
- [ ] Add visual review evidence format and reviewer sign-off.

**Exit:** a real asset can be generated from a source scene, exported, validated, registered, loaded by R3F and accepted with traceable evidence.

### P1 — First production slice
- [ ] Produce one hero tree and one hero architectural asset.
- [ ] Produce a small coherent temple slice: Tam Quan, courtyard, main hall exterior/interior focal area, lotus pond edge.
- [ ] Produce separate collision and reviewed navmesh for the playable route.
- [ ] Register every published GLB and reference it from the temple region.
- [ ] Verify desktop and mobile load, visual quality, LOD, collision and memory.

**Exit:** a player can traverse the slice without blockout geometry on the accepted route; all visible assets are registered and runtime accepted.

### P2 — Procedural world expansion
- [ ] Create biome profiles and deterministic scatter seeds.
- [ ] Add slope/height masks, exclusion zones, density limits and manual art-direction overrides.
- [ ] Generate environment variants and LODs with measurable budgets.
- [ ] Add region streaming/eviction and asset lifecycle telemetry.

**Exit:** a second region can be generated reproducibly from parameters and accepted through the same pipeline.

### P3 — Cinematic and interactive depth
- [ ] Expand animation, audio, water, weather, particle and interaction systems against real assets.
- [ ] Add cinematic camera/light presets with color-managed visual references.
- [ ] Validate accessibility and reduced-motion behavior for HTML UI and effects.

**Exit:** cinematic presentation is repeatable, interactive systems work with production assets, and quality tiers are measured.

### P4 — Scale and release
- [ ] Desktop/mobile GPU and memory budgets measured on named devices.
- [ ] Network soak and multi-client tests run against populated regions.
- [ ] Asset delivery/cache/version rollback verified.
- [ ] Release checklist and operational observability complete.

**Exit:** release decision is based on reproducible performance, reliability, security and content evidence.

## 11. Immediate work order

Do these in order; do not start by mass-generating assets:

1. Verify the local checkout path, branch, dirty/untracked files and Blender version.
2. Inventory local `.blend`, `.glb`, textures and renders without moving or deleting anything.
3. Verify Blender CLI can open a disposable scene and run one existing generator in a temporary output directory.
4. Verify the existing batch exporter and GLB validators on that output.
5. Verify PBR output channels in a real exported GLB.
6. Run the Blender MCP round-trip test if the bridge is configured; otherwise keep CLI pipeline as the supported path.
7. Select and approve the first hero asset brief, then produce the temple slice.

## 12. Non-goals and safeguards

- No destructive database migration or data reset is part of the asset-production architecture.
- No production deployment is authorized by this document.
- No mass overwrite, deletion or relocation of existing Blender scenes or local assets.
- No claim of AAA quality based only on tooling, source code, procedural geometry or CI syntax checks.
- No world expansion before the first playable region has a technically and visually accepted asset set.

## 13. Evidence required for completion

For every asset and production slice, retain:
- source `.blend` path and source revision;
- generation command/parameters/seed and tool versions;
- exported GLB and SHA-256;
- validator reports;
- screenshots/renders from Blender and the browser runtime;
- visual reviewer and acceptance date;
- target device, frame-time/FPS, memory and load-time captures;
- registry version and region manifest reference.

This architecture is accepted as the target design. Individual capabilities remain incomplete until their evidence is recorded.
