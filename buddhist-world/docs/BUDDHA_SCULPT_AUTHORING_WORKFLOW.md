# Buddha Statue — High-Poly Sculpt and Retopology Authoring

This workflow starts from the existing procedural Buddha silhouette and creates a safe Blender authoring workspace. It does not claim that Multires subdivision is a finished sculpt, or that a Shrinkwrap guide is finished retopology.

## Cultural/art direction gate

Before facial features, hands, mudra, robe construction, hair curls, usnisa/urna treatment, lotus iconography or inscriptions are finalized, attach an approved visual reference and record the regional/tradition choice. The current project art bible describes Vietnamese temple architecture, not a canonical Buddha iconography sheet. Do not infer Theravada/Mahayana, Amitabha/Shakyamuni, mudra or robe convention from the architecture.

The first sculpt pass may refine only the neutral seated silhouette, anatomy volumes and robe masses. Keep the face blank/neutral and hands simplified until the reviewer approves a reference. Do not invent sacred marks or script.

## 1. Prepare a new sculpt workspace

From repository root in Windows CMD:

    blender -b blender/projects/hero_props_source.blend --python blender/scripts/prepare_buddha_sculpt_workspace.py -- --out blender/projects/hero_buddha_sculpt_workspace.blend --levels 3

The script creates:

- SCULPT_hero_buddha_statue: duplicated organic statue forms with Multires levels for manual sculpting.
- RETOPO_GUIDES_hero_buddha_statue: separate low-density guides with temporary Shrinkwrap targets.
- The original EXPORT_hero_buddha_statue is preserved as a scale/proportion reference; it is not promoted as a final render mesh.

Open the output .blend in Blender. Save incremental versions such as hero_buddha_sculpt_v001.blend; do not overwrite the source or the workspace preparation file.

## 2. High-poly sculpt pass

Use the Multires modifier in Sculpt Mode on each SCULPT object. Suggested order:

1. Primary forms: torso volume, shoulder transition, crossed-leg silhouette, head-to-neck transition, ear placement and overall balance.
2. Secondary forms: robe masses, sleeve/forearm transitions, lotus petal silhouette and large folds.
3. Tertiary forms: subtle stone/bronze surface response and restrained chisel/wear marks only if the approved material reference calls for them.

Use broad brushes first (Grab, Clay Strips, Smooth, Scrape/Fill); keep detail brushes until the primary silhouette reads correctly at the actual camera distance. Use symmetry for the broad anatomy pass, then break symmetry only where the approved reference requires it.

Do not add pores, noisy skin, random cracks or decorative noise to the face. A devotional statue is not a photoreal human portrait.

Keep the original scale and origin. Avoid applying the Multires modifier. Retain the highest sculpt level in the source .blend; runtime must use retopology, never this high-poly source.

## 3. Manual quad retopology

The RETOPO_GUIDES collection is a guide only. It is not the final low-poly mesh. Create a separate collection named EXPORT_hero_buddha_statue after the quad retopology is reviewed.

- Use face sets/visibility isolation and retopologize head, ears, hands, torso, robe, legs and lotus pedestal as logically separated meshes where that makes the bake and material boundaries cleaner.
- Use Shrinkwrap to the matching SCULPT object while drawing quads; add a small offset only to avoid z-fighting.
- Keep even quad spacing across cheeks, eyelids, lips, ears, shoulders, elbows, robe folds and lotus petals. Avoid long thin sliver quads and poles on the face.
- Maintain edge loops around eyelids, mouth, ears and fingers if those details are in the approved sculpt.
- Keep the face and hands dense enough to preserve silhouette; reduce hidden underside and flat pedestal areas.
- Apply transforms, recalculate normals, remove duplicate/internal faces and verify manifold construction.
- Use quads for the authoring mesh. Triangulation happens only at GLB export.
- Keep a matching name suffix: low prop_buddha_statue_head ↔ high sculpt_buddha_statue_head. This exact suffix contract is required by bake_hero_sculpt_detail.py.

The project budget is 25k–40k triangles for the complete LOD0 statue including pedestal. Treat 40k as a hard ceiling, not a target. If the approved face/hand details exceed it, optimize the mesh and use the normal bake rather than blindly raising the budget.

## 4. UV and bake preparation

- Unwrap each retopologized object after final topology.
- Pack unique UVs without overlap; do not mirror unique face, robe wear or lotus ornament surfaces.
- Match 512 px/m at 1K (1024 px/m at 2K) as the common texel-density baseline.
- Keep at least 16 px bake margin at 1K; increase margin for larger maps/mip chains.
- Create a reviewed cage. Start with a small cage extrusion and ray distance, then inspect misses and projection errors before baking the entire statue.
- Bake tangent normal and AO from each matching SCULPT object to its prop_ low-poly counterpart using bake_hero_sculpt_detail.py.

Example after manually creating and naming the retopology collection and high-poly collection:

    blender -b blender/projects/hero_buddha_retopo_reviewed.blend --python blender/scripts/bake_hero_sculpt_detail.py -- --low-collection EXPORT_hero_buddha_statue --high-collection SCULPT_hero_buddha_statue --resolution 2048 --out blender/textures/hero_buddha_sculpt --blend-out blender/projects/hero_buddha_sculpt_baked.blend

Do not accept the bake until the face, hands, robe folds and lotus silhouette are checked under neutral lighting. Inspect normal maps as well as the material result.

## 5. PBR, LOD and acceptance

After sculpt normal/AO bake:

1. Run the shared PBR bake for Base Color, Roughness, Metallic and Tangent Normal.
2. Inspect each map independently and verify the correct color space.
3. Run validate_hero_props.py and hero_asset_quality_gate.py.
4. Generate LOD1/LOD2 from the reviewed low-poly collection only.
5. Compare silhouette and shading at 0–12 m, 12–32 m and 32–90 m.
6. Export a GLB and inspect in the R3F runtime at day/dawn/sunset/night and desktop/mobile quality settings.
7. Record cultural reviewer approval before setting HERO_ACCEPTED. Record runtime tests before RUNTIME_ACCEPTED.

## 6. Current truthful status

The workspace-preparation script creates Multires sculpt bases and Shrinkwrap guides. The artist still needs to perform the sculpt and manually create clean quad retopology in Blender. The current procedural source has no approved iconography reference, so face, hands, mudra and robe convention remain intentionally unresolved. No high-poly sculpt, final retopology, sculpt bake, final PBR maps, LOD exports or GLB acceptance should be claimed until the actual Blender files and reports exist.
