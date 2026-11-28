# Temple source asset export

This pipeline exports the supplied Blender source collections to individual GLB files for review. It does **not** register assets in the live game, change region transforms, or create collision/navmesh data.

## Source files

Place these original files in `blender/source/` without renaming them:

- `ENV_Temple_Ancillary_v02.blend`
- `ENV_Temple_Details_v01.blend`
- `ENV_Temple_Groundcover_v01.blend`

The files are opened by the export script; the source `.blend` files are never saved. Existing staged GLBs are never overwritten: use a fresh output directory for each export run. Unknown names passed to `--only` and empty selections fail instead of reporting a false success.

## Export with Blender 5.x

From the repository root in Windows CMD:

```cmd
blender.exe --background --python tools\blender\export-temple-source-assets.py -- --source-dir blender\source --output-dir blender\exports\temple-source-review
```

The output is staged under `blender/exports/temple-source-review/`. The generated `temple-source-export-report.json` records collection presence, object/mesh counts, polygon/vertex counts, materials, and output sizes.

## Asset grouping

- `architecture-district/`: Bell Pavilion, Drum Pavilion, Monk Quarters, Stone Pagoda, Sutra Library.
- `core-variants/`: Main Hall and Tam Quan variants. These are deliberately kept separate so they cannot replace the existing main hall or Tam Quan.
- `props/`: Lotus Pond Bridge, Stone Lantern, Dharma Wheel Stele, Guardian Lion, Hanging Temple Bell, Incense Urn, Main Altar, Seated Buddha.
- `groundcover/`: Fern Cluster, Flowering Shrub, Mossy Garden Stones.

## Acceptance gate

1. Confirm all expected collections exported and inspect the GLBs in Blender and the browser.
2. Run `pnpm validate:glb -- <export-folder> --budget architecture` for architectural models; use the prop/vegetation budget for the relevant folders.
3. Review scale, origin, orientation, UVs, PBR textures, silhouette, cultural appropriateness, and draw-call/triangle budgets.
4. Only after review, copy accepted GLBs into `apps/web/public/assets/...`, add measured transforms and collision metadata, and register them in `assetRegistry.ts` and the appropriate region manifest.
5. Build collision geometry and navmesh from the final placed geometry. Never infer either from Blender collection names.

A successful export is not proof of runtime readiness or human acceptance.
