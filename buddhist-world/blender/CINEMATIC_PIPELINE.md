# Cinematic procedural environment workflow

This pipeline adds a procedural landscape pass to the existing generated temple scene. It creates an editable environment foundation while keeping hero assets replaceable.

## What the generator creates

- A 250 × 250 m mountain-valley terrain with a low central temple basin and raised forested ridges.
- A southern pilgrimage path and a northern mountain-retreat path; both are added to the temple region navigation mesh.
- Secondary bell/drum pavilions, ancestor hall and mountain-retreat pavilion.
- Instanced broadleaf, pine and bodhi tree meshes; scattered boulders and ground-cover clumps.
- Lotus leaves and blossoms around the existing pond.
- Procedural PBR shader detail for terrain, bark, foliage, rock, path stone and roof tiles.
- A Blender-only overview camera and cinematic preview lighting.

The generator does not create final Buddha statues, detailed carved reliefs, hero characters, facial rigs, bespoke roof ornaments or final authored texture sets. Those remain separate Blender hero assets.

## Windows CMD — run from repository root

Generate the architectural base:

    blender -b --python blender/scripts/generate_temple_complex.py -- --out blender/projects/temple_complex_generated.blend

Add the cinematic environment:

    blender -b blender/projects/temple_complex_generated.blend --python blender/scripts/generate_cinematic_environment.py -- --out blender/projects/temple_complex_cinematic.blend

Validate and export:

    blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/asset_validation.py

    blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets

    blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/export_navmesh.py -- --region temple_complex --out apps/web/public/assets/navmesh/temple_complex.json

Validate exported files:

    pnpm validate:glb -- apps/web/public/assets/models

    pnpm validate:glb -- apps/web/public/assets/collision --collision

    pnpm validate:navmesh -- apps/web/public/assets/navmesh/temple_complex.json


## Reusable vegetation library

After the cinematic environment has been generated, build the region-aware vegetation pass:

    blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_vegetation_library.py -- --out blender/projects/temple_complex_vegetation.blend

The vegetation pass creates 15 reusable source mesh variants across five procedural silhouettes (pine, broadleaf, bodhi, bamboo and low shrub), then places linked instances across the six landscape zones. The source meshes are kept in the non-export `ASSET_LIBRARY_vegetation_sources` collection; runtime instances are grouped in `EXPORT_vegetation_temple_complex`. The pass uses a fixed seed for repeatable placement and does not modify collision or navmesh geometry.

Export and validate the new visual collection from the generated vegetation scene:

    blender -b blender/projects/temple_complex_vegetation.blend --python blender/scripts/asset_validation.py
    blender -b blender/projects/temple_complex_vegetation.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets
    pnpm validate:glb -- apps/web/public/assets/models

The exporter writes `vegetation_temple_complex.glb`. Register it in the runtime region manifest only after the file exists and has passed validation. This pass intentionally does not add tree-trunk colliders; collision proxies and player/NPC clearance need a separate reviewed pass. It is a reusable procedural base, not a replacement for hero bodhi trees, close-up foliage, authored bark/leaf textures or hand-shaped silhouettes.

## Export and integration

The existing batch exporter writes each EXPORT collection to its own GLB and each COLLISION collection to a collision GLB. The visual collections are exported separately as temple_complex.glb and cinematic_environment.glb.

Register these files in the region manifest only after the files exist under apps/web/public/assets/models/. Register collision geometry with render=false and verify it does not overlap player spawn points. Do not register missing generated files in the manifest.

The preview camera and lights are outside every EXPORT collection and therefore are not exported to game GLBs.

## Art-quality expectations

The generator supplies procedural geometry, instance variation, material detail and a cinematic Blender preview setup. It is not honest to call the result a finished AAA art pass before it has been rendered, inspected, optimized and tested in the actual game. Hero architecture, statues, character art, hand-authored textures, close-up foliage, water shading, fog, post-processing and final lighting still need dedicated art direction and in-game visual QA.

For the browser runtime, use instancing/LOD, texture atlases, baked ambient occlusion where appropriate, controlled shadow distance and adaptive quality profiles. Avoid exporting Blender preview lights and cameras as runtime assets.


## Ground vegetation and Geometry Nodes LOD

After generating the cinematic environment, run the ground-cover pass from the original cinematic scene:

    blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_ground_vegetation.py -- --out blender/projects/temple_complex_ground_vegetation.blend

The pass creates source meshes for grass tufts, ferns, small wildflowers and moss clumps. Python samples deterministic points against the same terrain-height function and excludes the central pilgrimage axis, temple/pavilion footprints and lotus pond. Geometry Nodes performs object instancing, randomized yaw and scale, then realizes instances for GLB export.

Three independent visual exports are produced by the existing batch exporter:

- \`ground_vegetation_lod0.glb\`: full point density and source geometry.
- \`ground_vegetation_lod1.glb\`: approximately 55% source mesh complexity and 42% point density.
- \`ground_vegetation_lod2.glb\`: approximately 22% source mesh complexity and 14% point density.

All LODs use prefixes of the same deterministic point set so their placement remains spatially consistent. They are visual-only: no collision or navmesh is created. The LOD GLBs are alternative representations and must not all be rendered simultaneously. Runtime should select one representation by camera distance/quality profile, with cross-fade or hysteresis to prevent visible popping.

Export and inspect:

    blender -b blender/projects/temple_complex_ground_vegetation.blend --python blender/scripts/asset_validation.py
    blender -b blender/projects/temple_complex_ground_vegetation.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets
    pnpm validate:glb -- apps/web/public/assets/models

Before adding these files to \`packages/shared/src/regions.ts\`, inspect the evaluated Geometry Nodes result in Blender and confirm all three GLBs exist and pass validation. The current region manifest intentionally remains unchanged until generated assets are present. Browser-side LOD selection, GPU instancing, frustum/distance culling and real-device profiling are a separate integration/QA step.


## Hero Bodhi tree and lotus ecosystem pass

After the reusable tree library has been generated, create a separate hero-vegetation scene:

    blender -b blender/projects/temple_complex_vegetation.blend --python blender/scripts/generate_hero_vegetation.py -- --out blender/projects/temple_complex_hero_vegetation.blend

This pass creates:
- A procedural Bodhi hero-tree base with a flared trunk, exposed buttress roots, branching limbs, layered foliage masses and reusable leaf cards.
- A lotus ecosystem with cupped/notched pads, leaf stems, layered curved petals, flower centers and marginal reeds.
- Separate visual-only export collections: `EXPORT_hero_bodhi_tree` and `EXPORT_lotus_ecosystem`.

Validate and export the two visual collections:

    blender -b blender/projects/temple_complex_hero_vegetation.blend --python blender/scripts/asset_validation.py
    blender -b blender/projects/temple_complex_hero_vegetation.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets
    pnpm validate:glb -- apps/web/public/assets/models

This is an editable procedural base, not final AAA art. The Bodhi silhouette, root sculpt, bark/leaf texture authoring, flower shape and material response still require Blender artist review. Water shader/animation is a separate R3F material task. The generator does not alter collision or navmesh, and the resulting GLBs must not be registered in the runtime manifest until generated and validated.


## Vietnamese temple architecture detailing pass

Run this after the cinematic environment base has been generated:

    blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_architecture_details.py -- --out blender/projects/temple_complex_architecture.blend

The additive pass creates:
- Timber bracket / *đấu củng - con sơn* inspired support groups beneath the main hall and Tam Quan eaves.
- Main-hall door lattice, raised panels, signboard and stair / ramp balustrade details.
- A tiered memorial stupa blockout placed on the generated hillside, with octagonal plinth, bell dome, spire and garden markers.

The output is isolated in `EXPORT_architecture_details`. It is visual-only; collision and navmesh collections remain unchanged. This pass deliberately does not duplicate the existing bell tower, drum tower, ancestor hall or mountain retreat pavilions, and does not claim final historical reconstruction accuracy. Hand-authored bracket joinery, carved stone, roof-end ornaments, detailed tile meshes, material textures and reference-based proportions remain an artist review task.

Validate and export:

    blender -b blender/projects/temple_complex_architecture.blend --python blender/scripts/asset_validation.py
    blender -b blender/projects/temple_complex_architecture.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets
    pnpm validate:glb -- apps/web/public/assets/models


## Cinematic art baseline and hero technical gate

The current visual source of truth is `docs/CINEMATIC_ART_BIBLE.md`. It formalizes the existing Vietnamese Buddhist art direction and locks the existing first-region anchors (Tam Quan, courtyard, main hall and lotus pond). Until approved reference images are supplied, use this art bible as the temporary baseline; do not invent a different regional layout.

Run the read-only Blender technical report against an exported collection:

    blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_temple_complex --out blender/reports/temple_base_quality.json

For an asset intended to pass the technical gate:

    blender -b path/to/hero_asset.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_asset --strict

The report checks mesh counts, triangle counts, UV presence and degenerate UV triangles, object scale, loose geometry, Principled BSDF materials and external/packed image references. It is deliberately read-only and writes only the JSON report. It does **not** certify UV overlap, texel density, topology suitability, visual quality, cultural accuracy, wind response or runtime performance. A technically passing asset must still receive close-up render review and GLB/R3F acceptance before it can be called HERO_ACCEPTED.

Do not add generated GLBs to `packages/shared/src/regions.ts` until they exist in the public assets directory, pass both Blender and GLB validation, and have been visually inspected. Preserve the current blockout, collision and navmesh as the gameplay reference until replacement geometry is reviewed.


## Standalone Hero Architecture — Tam Quan + Main Hall

This pass creates two independently exportable architectural hero collections at the existing world anchors. It is a new source scene and does not replace the cinematic environment, collision, navmesh or runtime region manifest.

Run from the repository root in Windows CMD with Blender installed:

    blender -b --python blender/scripts/generate_hero_architecture.py -- --out blender/projects/hero_architecture_source.blend --render blender/reports/hero_architecture_overview.png

The output contains:

- `EXPORT_hero_tam_quan`: four-column three-bay gate, stone plinths, layered timber/bracket details, blank signboard reserved for reviewed Vietnamese lettering, curved roof substrate and individually modelled terracotta tile field.
- `EXPORT_hero_main_hall`: raised stone plinth, column grid, side/rear walls, central doorway and lattice, structural beams, bracket sets, exposed rafters, curved tiled roof, entry steps and balustrades.
- `QA_preview_rig`: neutral overview camera and preview lights, excluded from GLB export.
- `ASSET_LIBRARY_architecture_sources`: reserved non-export source collection.

Each hero collection remains separate and carries explicit `PROCEDURAL_BASE` metadata. The UV pass is an initial Smart UV Project unwrap; it does not certify texel density, seam placement or overlap. Materials use procedural Blender nodes for look development and are **not yet glTF-ready baked PBR texture sets**.

After inspecting the source scene, export and run technical checks:

    blender -b blender/projects/hero_architecture_source.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_tam_quan --out blender/reports/tam_quan_quality.json
    blender -b blender/projects/hero_architecture_source.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_main_hall --out blender/reports/main_hall_quality.json
    blender -b blender/projects/hero_architecture_source.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets
    pnpm validate:glb -- apps/web/public/assets/models

The batch exporter produces separate `hero_tam_quan.glb` and `hero_main_hall.glb` files. Do not register either in `packages/shared/src/regions.ts` until the files exist, validate, receive close-up visual review and pass R3F scale/material/performance inspection. This procedural generator does not create final collision or navmesh assets; keep the current gameplay geometry authoritative during visual replacement.



## Hero PBR texture baking and isolated GLB export

The hero architecture generator creates procedural look-development materials. Bake them before exporting a hero GLB; do not export the source preview scene and assume its procedural node graphs will translate identically to glTF.

Bake one collection at a time. The bake script duplicates its materials for the selected collection and writes a **new** .blend file, leaving the source .blend untouched:

    blender -b blender/projects/hero_architecture_source.blend --python blender/scripts/bake_hero_pbr.py -- --collection EXPORT_hero_tam_quan --out blender/textures/hero_tam_quan --blend-out blender/projects/hero_tam_quan_pbr.blend --resolution 1024

    blender -b blender/projects/hero_architecture_source.blend --python blender/scripts/bake_hero_pbr.py -- --collection EXPORT_hero_main_hall --out blender/textures/hero_main_hall --blend-out blender/projects/hero_main_hall_pbr.blend --resolution 1024

The script uses Cycles baking and creates Base Color (sRGB), Roughness (Non-Color), Metallic (Non-Color) and Tangent Normal (Non-Color) PNG maps per material. Images are packed into the new .blend and connected to Principled BSDF inputs. Use 2048 only for hero materials where close-up review demonstrates a need; 4096 is available but should not be the default. Bake time and memory depend on material count and resolution.

Run technical review on the baked scene, then export only the baked collection so the other unbaked hero is not accidentally included:

    blender -b blender/projects/hero_tam_quan_pbr.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_tam_quan --strict --out blender/reports/tam_quan_pbr_quality.json

    blender -b blender/projects/hero_tam_quan_pbr.blend --python blender/scripts/batch_export.py -- --collection EXPORT_hero_tam_quan --out apps/web/public/assets

    blender -b blender/projects/hero_main_hall_pbr.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_main_hall --strict --out blender/reports/main_hall_pbr_quality.json

    blender -b blender/projects/hero_main_hall_pbr.blend --python blender/scripts/batch_export.py -- --collection EXPORT_hero_main_hall --out apps/web/public/assets

    pnpm validate:glb -- apps/web/public/assets/models

The collection filter in `batch_export.py` is optional; omitting it preserves the existing export-all behavior for legacy pipelines. A passing technical gate means the scene has UVs, image-backed Principled materials and basic mesh/transform checks. It does not verify UV overlap, texel density, image-map semantic correctness, cultural accuracy or visual quality. Inspect the four maps, render close-ups and verify the exported GLB in R3F before marking an asset `HERO_ACCEPTED`.



## Standalone Hero Props — Buddha statue, Dai Hong Chung and incense burner

The Hero Props pass creates a new source scene with three independently exportable collections. It does not append to or overwrite the existing temple/environment scene.

Generate from a clean Blender startup scene (Windows CMD, repository root):

    blender -b --python blender/scripts/generate_hero_props.py -- --out blender/projects/hero_props_source.blend --render blender/reports/hero_props_overview.png

The optional `--render blender/reports/hero_props_overview.png` argument writes three isolated review images: `hero_props_overview_hero_buddha_statue.png`, `hero_props_overview_hero_dai_hong_chung.png` and `hero_props_overview_hero_incense_burner.png`. The collections remain at local origin for clean standalone GLB exports; they are not shifted into a shared preview lineup.

The scene contains:

- `EXPORT_hero_buddha_statue`: seated statue blockout, lotus pedestal, robe masses and folds. The iconographic pose, mudra, face, robe treatment and proportions are explicitly pending cultural/art-direction review.
- `EXPORT_hero_dai_hong_chung`: hollow cast-bell shell, inner wall, mouth rim, raised bands, bosses, crown, suspension loop and separate clapper. The suspension point is only a future interaction anchor; swing physics and sound are runtime work.
- `EXPORT_hero_incense_burner`: stone pedestal, hollow bronze bowl, lip, handles and separate incense sticks. The collection stores a smoke-emitter candidate at local game coordinates `[0, 2.46, 0]`; smoke itself belongs to the shared runtime Particle Engine and is not baked into the mesh.
- `QA_preview_rig`: overview camera and lights, excluded from GLB export.

All three collections use the same procedural material family (weathered limestone, aged bronze, bronze highlights/patina, muted gilt and restrained lacquer), Principled BSDF nodes, metric dimensions, normalized `prop_*` names and initial Smart UV Project unwraps. These are procedural look-development materials, not final scanned/hand-authored surface textures. Use the same Cycles PBR baker and read-only quality gate as Hero Architecture.

Bake each collection independently to a new .blend file:

    blender -b blender/projects/hero_props_source.blend --python blender/scripts/bake_hero_pbr.py -- --collection EXPORT_hero_buddha_statue --out blender/textures/hero_buddha_statue --blend-out blender/projects/hero_buddha_statue_pbr.blend --resolution 1024

    blender -b blender/projects/hero_props_source.blend --python blender/scripts/bake_hero_pbr.py -- --collection EXPORT_hero_dai_hong_chung --out blender/textures/hero_dai_hong_chung --blend-out blender/projects/hero_dai_hong_chung_pbr.blend --resolution 1024

    blender -b blender/projects/hero_props_source.blend --python blender/scripts/bake_hero_pbr.py -- --collection EXPORT_hero_incense_burner --out blender/textures/hero_incense_burner --blend-out blender/projects/hero_incense_burner_pbr.blend --resolution 1024

Run the technical gate and isolated GLB export for each baked scene:

    blender -b blender/projects/hero_buddha_statue_pbr.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_buddha_statue --strict --out blender/reports/hero_buddha_statue_quality.json
    blender -b blender/projects/hero_buddha_statue_pbr.blend --python blender/scripts/batch_export.py -- --collection EXPORT_hero_buddha_statue --out apps/web/public/assets

    blender -b blender/projects/hero_dai_hong_chung_pbr.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_dai_hong_chung --strict --out blender/reports/hero_dai_hong_chung_quality.json
    blender -b blender/projects/hero_dai_hong_chung_pbr.blend --python blender/scripts/batch_export.py -- --collection EXPORT_hero_dai_hong_chung --out apps/web/public/assets

    blender -b blender/projects/hero_incense_burner_pbr.blend --python blender/scripts/hero_asset_quality_gate.py -- --collection EXPORT_hero_incense_burner --strict --out blender/reports/hero_incense_burner_quality.json
    blender -b blender/projects/hero_incense_burner_pbr.blend --python blender/scripts/batch_export.py -- --collection EXPORT_hero_incense_burner --out apps/web/public/assets

    pnpm validate:glb -- apps/web/public/assets/models

The expected GLB names are `hero_buddha_statue.glb`, `hero_dai_hong_chung.glb` and `hero_incense_burner.glb`. Do not add them to the runtime region manifest merely because export succeeded. Require: inspect the baked maps and UV layout; close-up neutral/daylight and cinematic renders; cultural review for the statue and region-specific ornament; GLB material/scale inspection in R3F; triangle/draw-call/texture-memory profiling; and mobile quality-tier testing. The incense smoke and bell swing/audio controllers are separate runtime features. Collision, navmesh, spawn and map anchors remain unchanged.


### Hero Props acceptance gate

After baking each prop, run the dedicated read-only contract validator before export. It checks collection identity and metadata, required structural objects, `prop_*` naming, `UVMap` presence and 0–1 UV bounds, applied object scale, material slots, Principled BSDF, all four baked map nodes, map color spaces, packed/present image files and per-prop triangle budget (40,000 technical ceiling). The triangle ceiling is not a performance target; profile and build LODs before runtime acceptance.

    blender -b blender/projects/hero_buddha_statue_pbr.blend --python blender/scripts/validate_hero_props.py -- --collection EXPORT_hero_buddha_statue --require-baked --strict --out blender/reports/hero_buddha_statue_acceptance.json

    blender -b blender/projects/hero_dai_hong_chung_pbr.blend --python blender/scripts/validate_hero_props.py -- --collection EXPORT_hero_dai_hong_chung --require-baked --strict --out blender/reports/hero_dai_hong_chung_acceptance.json

    blender -b blender/projects/hero_incense_burner_pbr.blend --python blender/scripts/validate_hero_props.py -- --collection EXPORT_hero_incense_burner --require-baked --strict --out blender/reports/hero_incense_burner_acceptance.json

The validator is intentionally technical. It does not calculate UV overlap or texel density, judge the Buddha statue's iconography, inspect texture appearance, or certify GLB/R3F/mobile performance. A passing result is only a technical gate, not `HERO_ACCEPTED`.
