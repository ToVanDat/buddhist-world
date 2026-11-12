# Hero Buddha Statue — Neutral Sculpt & Retopology Plan

## Approved art direction

- Subject: generic Buddha statue, deliberately neutral until a cultural reference is approved.
- Pose: seated meditation, cross-legged.
- Reference: none supplied. Work only on proportion, anatomy masses and silhouette.
- Orientation: Blender front is -Y; metric units.
- No canonical features are to be inferred from a generic label. Do not add urna, ushnisha, hair curls, crown, elongated earlobes, a named mudra, lotus iconography, inscriptions or region-specific robe motifs without review.

## Generate a fresh, non-destructive workspace

Run from the repository root in Windows CMD. First enter the project folder containing pnpm-workspace.yaml. Blender 4.x is required.

    cd buddhist-world
    blender -b --python blender/scripts/generate_buddha_sculpt_workspace.py -- --out blender/projects/hero_buddha_neutral_workspace.blend --levels 2 --voxel-size 0.035 --target-faces 14000
    blender blender/projects/hero_buddha_neutral_workspace.blend

The script refuses to run in a non-empty scene and refuses to overwrite an existing output unless --overwrite is explicitly supplied. It creates:

| Collection | Purpose | Acceptance |
|---|---|---|
| SOURCE_neutral_buddha_statue | Joined voxel-remeshed blockout source | Reference only; hidden in viewport |
| SCULPT_hero_buddha_statue | Editable body with Multires modifier | Starting point for manual sculpt |
| RETOPO_AUTO_hero_buddha_statue | Quadriflow-generated quad starter plus temporary Shrinkwrap | Hidden; not production topology |
| BLOCKOUT_plinth_hero_buddha_statue | Plain, undecorated plinth parts only | Blockout only; no UV/PBR/export acceptance |

The body is assembled from overlapping anatomical volumes, voxel-remeshed and relaxed. The initial hands are mitten-like masses resting on the lap. This is a neutral silhouette blockout, not a finished statue, not a cloth simulation and not a final hand pose.

## Sculpt stage — do this before final retopology

Open SCULPT_hero_buddha_statue and work in Sculpt Mode. Keep the source collection untouched.

1. **Primary forms**
   - Refine the head-to-body proportion, neck transition, shoulder width and torso taper.
   - Clarify the cross-legged silhouette and the support/contact between thighs, shins and pelvis.
   - Refine upper-arm, forearm and hand volumes so the arms rest naturally on the lap.
   - Keep left/right anatomy broadly balanced; intentional asymmetry can be added only after the neutral silhouette reads correctly.
2. **Secondary forms**
   - Establish a single restrained robe mass over the body.
   - Add broad, gravity-led robe folds only after the body silhouette is accepted.
   - Keep the face blank or minimally blocked; do not sculpt a canonical facial expression without a reference.
3. **Tertiary forms**
   - Defer pores, tiny wrinkles, fabric weave, ornamental trim and surface wear.
   - Do not add symbolic marks or sacred text.
4. **Sculpt review**
   - Inspect front, side, rear, three-quarter and silhouette views.
   - Check the statue at thumbnail size; the seated pose must read without surface detail.
   - Save checkpoints as separate .blend versions before destructive operations.

Suggested sculpt sequence: Grab/Move for silhouette, Clay Strips for broad volumes, Smooth for transitions, Crease only for approved cloth boundaries. Use symmetry for the first pass; turn it off only for reviewed asymmetry.

## Retopology — convert the sculpt, then clean it

RETOPO_AUTO_hero_buddha_statue is an automatic quad-remesh starter generated from the initial blockout. It is **not** the final retopology. After the high-poly sculpt is accepted:

1. Duplicate the final high-poly body into a dedicated backup collection.
2. Run Quadriflow again from the final sculpt at a deliberate face target. Keep symmetry enabled for the first pass if the sculpt is still symmetrical.
3. Keep the temporary Shrinkwrap target assigned to the final sculpt; use a small positive offset to prevent z-fighting.
4. Manually correct edge flow around shoulders, elbows, wrists, hands, knees, ankles, neck and face. Quadriflow can produce awkward poles and uneven density; inspect every deformation-critical region.
5. Remove internal faces, non-manifold edges, duplicate vertices and stretched quads. Recalculate normals.
6. If the statue will remain static, topology can prioritize silhouette and bake quality. Do not spend deformation topology budget on a non-rigged statue.
7. Apply Shrinkwrap only after inspection. Rename the reviewed collection to EXPORT_hero_buddha_statue only when it contains the approved low-poly body and the plain pedestal components.

Naming contract:
- High-poly: sculpt_buddha_statue_body
- Final low-poly: prop_buddha_statue_body
- Temporary auto result: retopo_auto_buddha_statue_body

Do not rename an automatic result to the final prop_ name before manual review.

## UV, bake and PBR gates

After retopology is approved:

- Apply object scale; maintain consistent real-world scale and clean normals.
- Create non-overlapping UV islands. Avoid mirrored UVs for unique face, robe and wear details.
- Keep a consistent texel-density target across the statue. Use 1K for a reviewed mid-distance asset and 2K for a close hero asset only when the detail is visible in runtime.
- Create and inspect a bake cage; check projection distance around ears, hands, crossed legs and robe folds.
- Bake tangent-space normal and AO from high-poly to final low-poly. Then bake Base Color, Roughness and Metallic as separate channels/maps according to the project material pipeline.
- Set Base Color to sRGB; data maps (normal, roughness, metallic, AO) to Non-Color. Inspect the normal map in the target renderer.
- Check seams, skewing, gradients, cage misses, padding and mip-level bleeding at 100% and at runtime distance.

Do not mark PBR complete because a Principled BSDF material exists. The maps must be baked, packed or exported, and visually checked in Blender and the web runtime.

## LOD and export

Only generate LODs from the accepted final low-poly asset:

- LOD0: reviewed hero mesh; target 25k–40k triangles for the complete statue including pedestal, with 40k as a ceiling rather than a target.
- LOD1: approximately 50% of LOD0 triangles, preserving face/hand silhouette and major robe contours.
- LOD2: approximately 18–20% of LOD0 triangles, for distant views.
- Check silhouette, normals, UVs, material slots and transition popping at actual camera distances.
- Keep the high-poly sculpt and bake sources out of the runtime GLB.

The project budget is a starting constraint, not permission to destroy the silhouette. If the hero view needs more geometry, justify it with measured runtime performance.

## Acceptance checklist

- [ ] Neutral art direction and pose approved.
- [ ] Primary silhouette reviewed from front/side/rear/three-quarter.
- [ ] Secondary robe volumes reviewed; no unapproved iconography.
- [ ] High-poly sculpt checkpoint saved.
- [ ] Quadriflow result manually cleaned; edge flow and manifold checks pass.
- [ ] Final low-poly is named prop_buddha_statue_body.
- [ ] UV overlap and texel density inspected.
- [ ] Bake cage inspected; normal/AO bake has no projection errors.
- [ ] PBR maps packed/exported with correct color spaces.
- [ ] LOD0/1/2 visually reviewed.
- [ ] GLB validator passes and asset is inspected in R3F at desktop and mobile quality tiers.

A generated workspace or an automatic quad-remesh is not an acceptance result. Until the checklist is backed by a real Blender file, bake outputs and runtime inspection, report the asset as BLOCKOUT / AUTHORING IN PROGRESS, not PRODUCTION READY.
