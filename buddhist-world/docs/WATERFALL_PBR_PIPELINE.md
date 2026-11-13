# Waterfall and PBR texture pipeline

This pass adds the mountain-retreat waterfall set and a tileable PBR texture-map generator. It remains an authoring/runtime foundation; it does not claim final AAA quality without Blender renders and browser review.

## Blender scene order

Run commands from the repository's `buddhist-world` directory in Windows CMD. Start with the already generated cinematic scene. If the architecture-detail pass is part of the scene you want to export, run it before the waterfall pass.

```cmd
blender -b blender/projects/temple_complex_cinematic.blend --python blender/scripts/generate_architecture_details.py -- --out blender/projects/temple_complex_architecture.blend

blender -b blender/projects/temple_complex_architecture.blend --python blender/scripts/generate_waterfall_environment.py -- --out blender/projects/temple_complex_waterfall.blend

blender -b blender/projects/temple_complex_waterfall.blend --python blender/scripts/generate_pbr_material_library.py -- --out blender/projects/temple_complex_pbr.blend

blender -b blender/projects/temple_complex_pbr.blend --python blender/scripts/generate_pbr_texture_maps.py -- --out apps/web/public/assets/textures/pbr --size 512 --blend-out blender/projects/temple_complex_pbr_textured.blend

blender -b blender/projects/temple_complex_pbr_textured.blend --python blender/scripts/asset_validation.py

blender -b blender/projects/temple_complex_pbr_textured.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets

pnpm validate:glb -- apps/web/public/assets/models
```

The architecture-detail pass should only be run once on a fresh cinematic scene. The waterfall pass refuses to run if its output collection already exists; restart from the cinematic/architecture scene rather than re-running it on its own output.

## Waterfall placement

- Shared game-space placement: approximately `x=-24, z=-105`, near the north-west side of the mountain retreat.
- Blender generator samples the same terrain height function as the cinematic landscape and creates a limestone lip, side-rock clusters, a vertical UV-mapped water curtain, a plunge pool and moss/wet-rock dressing.
- All waterfall Blender meshes are visual-only in `EXPORT_waterfall_environment`. Collision and navmesh are deliberately untouched; author collision separately after visual review.
- Runtime `MountainRetreatWaterfall` currently provides the corresponding blockout cliff, animated waterfall sheet, impact foam, mist particles and wet rocks in `TempleRegion`. Replace this runtime blockout with the exported waterfall GLB when the real environment manifest is registered; do not render both versions together.

## Runtime water

- The lotus pond uses a Drei planar reflector plus the animated ripple/caustic shader overlay.
- Reflection quality follows the existing graphics profile: ULTRA 768, HIGH 512, MEDIUM 256, LOW/MOBILE disabled. Lower profiles retain animated water without the planar reflection pass.
- Waterfall sheet, impact foam and mist use independent time uniforms and dispose their GPU resources on unmount.
- Planar reflection is not screen-space reflection. It is a bounded extra render pass and still needs device profiling and visual tuning.

## PBR texture sets

`generate_pbr_texture_maps.py` creates tileable 512px base-color, roughness, tangent-space normal and AO maps for six roles: terracotta, dark teak, red lacquer, limestone, aged bronze and moss. It wires base-color, roughness and normal into the matching `BW_PBR_*` materials and existing procedural aliases; AO is packed into the .blend as an authoring map but is not yet connected to a glTF occlusion channel.

These maps are deterministic procedural starting textures, not scanned/material-library textures. Hero architecture still needs authored UV review, higher-frequency bespoke detail, edge wear, decals, and hand-tuned roughness/normal maps. Avoid treating generated maps as unique high-resolution surface scans.

## Validation still required

- Run Blender on the generated .blend files and inspect the waterfall from front, side and overview cameras.
- Run asset validation and GLB validation; confirm the exported waterfall mesh has valid UVs and no unexpected transparent sorting.
- Run `pnpm typecheck` and `pnpm build`, then open the world in a browser and inspect reflection, foam, mist, wet rocks and water/cliff alignment.
- Profile reflection render cost on HIGH, MEDIUM and MOBILE devices.
- Review the final visual asset and author a separate simplified collision mesh/navmesh update only after the terrain and waterfall placement are accepted.
