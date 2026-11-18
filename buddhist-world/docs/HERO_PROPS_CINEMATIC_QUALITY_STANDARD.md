# Hero Props — Cinematic Sculpt, PBR and Runtime Standard

Cập nhật: 2026-11-12. Áp dụng cho hero_buddha_statue, hero_dai_hong_chung và hero_incense_burner.

## 1. Asset truth and acceptance states

- PROCEDURAL_BASE: generated proportions and component layout only.
- SCULPT_SOURCE: approved high-poly sculpt source exists.
- RETOPO_READY: clean render mesh, UVs and bake cages reviewed.
- PBR_BAKED: maps baked, packed and visually checked.
- LOD_READY: three LOD levels exist and silhouette/material transitions reviewed.
- VISUAL_REVIEW: close-up renders reviewed at intended camera distances.
- HERO_ACCEPTED: technical, cultural and visual sign-off recorded.
- RUNTIME_ACCEPTED: GLB inspected in R3F, interaction/audio/particle and device performance verified.

A script exit code is not artistic acceptance. Never change the runtime region manifest merely because a GLB exported.

## 2. Sculpt and topology

### Buddha statue

The current generator is a silhouette blockout, not a sculpt. Preserve it as a scale/proportion reference only.

1. Duplicate the source scene to a new sculpt file; retain a read-only copy of the generated source.
2. Block primary masses in Sculpt Mode: lotus seat, crossed legs, torso, shoulders, head, ears and usnisa. Resolve overall silhouette and seated balance before facial details.
3. Build high-poly sculpt layers: primary anatomy/robe masses, secondary robe folds and lotus petals, tertiary stone/metal surface detail. Use multires or voxel remesh only on the sculpt copy.
4. Sculpt face and hands last. Do not invent mudra, urna/usnisa treatment, robe convention, crown/hair treatment or regional iconography. These require approved source material and qualified human review.
5. Retopologize manually around face, ears, hands, robe folds and lotus petals. Keep quads where edge flow matters; triangulate only at export.
6. Target LOD0 at 25k–40k triangles for the entire prop, including pedestal. The 40k value is a hard technical ceiling, not a guaranteed performance budget.
7. Bake high-poly normals and AO onto the retopologized low-poly mesh using explicit high-to-low selection and a reviewed cage. The current generic PBR baker does not yet implement a high-to-low sculpt cage workflow; do not label a normal map as sculpt-baked until that dedicated bake is performed.

### Đại hồng chung

- Model a true hollow cast shell with consistent wall thickness, mouth lip, crown and suspension loop.
- Split structural cast parts from applied relief so they can be retopologized and baked independently.
- Reserve bands, bosses, lotus/cloud motifs and any inscription for approved reference sheets. Never generate pseudo-Chinese/Vietnamese characters, invented mantras, dates, dynastic marks or temple names.
- Keep the clapper as a separate pivot-ready object; it is an internal striker, not an external mallet.

### Lư hương

- Model bowl wall thickness, rim, handles, pedestal/feet, ash bed and incense sticks as distinct logical parts.
- Decorative panels, lotus/cloud patterns, handles and any inscriptions must trace an approved regional reference. Do not use generic ornamental patterns as a substitute for cultural review.
- The ember/smoke origin is a runtime attachment point, not baked smoke geometry.

### Topology rules for all three

- Apply object transforms; keep real-world scale in metres and consistent Y-up export convention.
- Use bevels only where they change silhouette or catch a highlight; do not bevel every edge.
- Remove internal faces, loose vertices, duplicate surfaces and non-manifold construction remnants.
- Keep moving parts separate: bell shell, clapper, suspension pivot; incense sticks/ember anchor; statue remains static.
- Create explicit named high/low source collections. Never decimate the only sculpt source.

## 3. Shared PBR and texel-density contract

### Maps

| Map | Format | Color space | Purpose |
|---|---|---|---|
| Base Color | PNG, 8-bit sRGB | sRGB | Pigment, bronze oxidation and dirt tint |
| Roughness | PNG, 8-bit | Non-Color | Broad and micro roughness variation |
| Metallic | PNG, 8-bit | Non-Color | Metal only; stone/wood remain 0 |
| Tangent Normal | PNG, 8-bit | Non-Color | Sculpt and micro surface detail |
| AO / Dirt mask | Optional PNG | Non-Color | Controlled recess dirt, not a global dark overlay |
| Curvature / Wear mask | Optional PNG | Non-Color | Edge wear and hand-authored patina control |

glTF metallic-roughness packs roughness in G and metallic in B when using a combined ORM texture. The current bake tool writes separate maps; packing is a later optimization, not a reason to confuse channels.

### Common texel density

- Shared target: 512 px/m at 1K, equivalent to 1024 px/m at 2K.
- Face, hand, bell relief and close-up inscription-free detail may use a 2x density exception only when camera framing requires it.
- Keep the same density target across all three props; do not give the Buddha a much sharper texture merely because it is the focal asset.
- Reserve 2K for normal hero viewing. Use 4K only for verified extreme close-ups and after memory profiling.
- UV islands must be packed without accidental overlap. Intentional mirrored overlap is not allowed for unique wear, patina or inscription surfaces.
- Maintain consistent padding at target mip levels; 16 px at 1K is the baseline bake margin, and increase it for 2K/4K exports.
- The baker now duplicates materials per object/material slot because independent Smart UV unwraps otherwise share a single image and overwrite one another. This increases texture count; atlas consolidation is a later optimization.

### Controlled surface response

- Roughness: broad noise at low amplitude, micro variation at high frequency; never use random high-contrast speckle.
- Bronze patina: green/blue-green oxidation concentrated in protected recesses, with irregular breakup. Keep convex raised details warmer and brighter.
- Edge wear: restrained warm metal reveal on exposed convex edges only; avoid uniform gold outlines.
- Dirt: localize to contact points, seams, lower recesses and ash accumulation. Do not paint a global brown gradient over the prop.
- Micro-normal: very low amplitude, scale-aware. It must not replace the baked sculpt normal or create a pebbled statue face.
- Limestone: chalky roughness, subtle pores and restrained darker deposits; no metallic response.
- Preview nodes are look-development only. Final maps must be baked in Cycles and inspected individually under neutral lighting.

## 4. Blender source pipeline

From repository root in Windows CMD:

    blender -b --python blender/scripts/generate_hero_props.py -- --out blender/projects/hero_props_source.blend --render blender/reports/hero_props_source.png

After high-poly sculpt and retopology are authored in a reviewed source scene, add the controlled surface layers to each collection before baking:

    blender -b blender/projects/hero_props_retopo.blend --python blender/scripts/configure_hero_surface_layers.py -- --collection EXPORT_hero_buddha_statue
    blender -b blender/projects/hero_props_retopo.blend --python blender/scripts/configure_hero_surface_layers.py -- --collection EXPORT_hero_dai_hong_chung
    blender -b blender/projects/hero_props_retopo.blend --python blender/scripts/configure_hero_surface_layers.py -- --collection EXPORT_hero_incense_burner

Save the look-development scene to a new file before baking. Then bake each collection to its own output .blend and texture directory using bake_hero_pbr.py. The baker isolates maps per object/material slot to prevent overlapping object UV islands from writing into the same image.

Generate LOD copies only from the reviewed retopology scene:

    blender -b blender/projects/hero_props_retopo.blend --python blender/scripts/generate_hero_prop_lods.py -- --props all

This creates EXPORT_<asset>_lod1 at 50% and lod2 at 18% of source polygon count. These ratios are starting points only; inspect silhouettes, tiny relief, normals and texture seams. Export each LOD collection independently with batch_export.py -- --collection ....

## 5. Runtime LOD and lighting

RegionAssetDef.lods now supports both vegetation and static Hero Props. Static Hero assets use StaticLodAsset; vegetation keeps the wind-aware renderer.

Initial distance proposal (metres, camera-to-object):

| Level | Distance | Content |
|---|---:|---|
| LOD0 | 0–12 | Full approved retopology and normal detail |
| LOD1 | 12–32 | 50% starting reduction; retain silhouette and major relief |
| LOD2 | 32–90 | 18% starting reduction; remove small relief and hidden details |
| Culled | over 90–150 | Hide only if no interaction/audio/quest state depends on visibility |

Use hysteresis 0.08–0.12 to reduce popping. These are starting thresholds; tune them from frame-time and visual tests on desktop and mobile. Do not use the high-poly sculpt in runtime.

Hero props use the existing day/dawn/sunset/night lighting profiles. Do not add a dedicated shadow-casting light per prop. Validate bronze highlights and statue facial readability under all presets; use baked material response and environment lighting rather than excessive metallic specular.

## 6. Runtime contracts

### Bell

- Keep bell shell static or on one controlled pivot; the clapper is a child on its own pivot.
- Interaction remains server-authoritative through the existing clientInteract / serverInteractResult events and cooldown. Client animation is cosmetic and begins only after server confirmation.
- Use a damped angular impulse with a short attack and decaying oscillation; do not continuously rotate the bell.
- Audio should be a reviewed recording or designed multi-partial bell sample with long natural decay, spatial attenuation and a per-user audio unlock. Current oscillator cue is only a placeholder and must not be presented as a recorded temple bell.
- Avoid duplicate local playback when the server broadcasts the same world event to all clients.

### Incense and shared Particle Engine

- Smoke starts at a named ember attachment point on the burner, not at the prop origin.
- The shared engine uses instancing and bounded particle counts. Wind drift is supplied from the shared Wind Field; particle systems must not each invent an unrelated wind direction.
- Incense smoke uses slow rise, soft opacity, low contrast and turbulence; it should not look like opaque white steam.
- Add deterministic seeds, quality-tier particle caps, pause/visibility handling and reduced-motion/low-quality behavior before production.
- Do not persist individual particles. Persist only the burner/interaction state if gameplay later requires it.

### Statue

- Static devotional object; no physics, ragdoll, damage, or arbitrary player manipulation.
- Interaction is respectful and server-authoritative; no collision/visual mesh coupling.

## 7. Acceptance checklist

- [ ] Approved iconography and regional reference sheet attached to the asset record.
- [ ] High-poly source retained and sculpt layers named.
- [ ] Retopology silhouette, edge flow and normals reviewed.
- [ ] Bake cage reviewed; sculpt normal/AO bake confirmed from high to low.
- [ ] UV overlap and texel density inspected, not inferred from script success.
- [ ] Base Color, Roughness, Metallic, Normal and optional masks reviewed independently.
- [ ] Patina, edge wear and dirt masks are restrained and material-appropriate.
- [ ] LOD0/1/2 silhouettes compared at their actual transition distances.
- [ ] GLB validator and Blender technical validator pass.
- [ ] R3F inspection at day/dawn/sunset/night and desktop/mobile quality tiers.
- [ ] Bell interaction, clapper motion, spatial audio and multiplayer duplicate-event behavior tested.
- [ ] Smoke particle count, wind response, visibility and frame-time tested.
- [ ] Human cultural reviewer approves statue iconography and all decorative motifs.
- [ ] Asset record is marked HERO_ACCEPTED and RUNTIME_ACCEPTED only after all above pass.

## 8. Known implementation boundary

The current bake_hero_pbr.py creates separate Base Color, Roughness, Metallic and Tangent Normal maps from the loaded mesh/material graph. It does not yet provide a dedicated sculpt high-to-low cage bake, automated UV packing/overlap proof, calibrated texel-density repacking, or hand-painted dirt/curvature masks. The new surface-layer script supplies controlled look-development nodes; it does not replace those missing authoring/review steps.
