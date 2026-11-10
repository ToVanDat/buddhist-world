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
