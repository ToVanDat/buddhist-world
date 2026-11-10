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

## Export and integration

The existing batch exporter writes each EXPORT collection to its own GLB and each COLLISION collection to a collision GLB. The visual collections are exported separately as temple_complex.glb and cinematic_environment.glb.

Register these files in the region manifest only after the files exist under apps/web/public/assets/models/. Register collision geometry with render=false and verify it does not overlap player spawn points. Do not register missing generated files in the manifest.

The preview camera and lights are outside every EXPORT collection and therefore are not exported to game GLBs.

## Art-quality expectations

The generator supplies procedural geometry, instance variation, material detail and a cinematic Blender preview setup. It is not honest to call the result a finished AAA art pass before it has been rendered, inspected, optimized and tested in the actual game. Hero architecture, statues, character art, hand-authored textures, close-up foliage, water shading, fog, post-processing and final lighting still need dedicated art direction and in-game visual QA.

For the browser runtime, use instancing/LOD, texture atlases, baked ambient occlusion where appropriate, controlled shadow distance and adaptive quality profiles. Avoid exporting Blender preview lights and cameras as runtime assets.
