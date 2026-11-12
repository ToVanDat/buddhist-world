# Cinematic Art Bible — Buddhist World

**Status:** Initial production baseline (reference images not yet supplied)  
**Scope:** First playable region, `temple_complex`  
**Coordinate system:** Game world Y-up, metres; Blender Z-up  
**Art target:** Cinematic, physically believable Vietnamese Buddhist precinct. “AAA / hero” is an acceptance target, not a claim that current generated files already meet it.

This document is the temporary visual source of truth until approved reference images are available. It deliberately uses the existing repository art direction and world coordinates rather than inventing a new layout.

## 1. Art direction

### Visual identity
- Respectful Vietnamese Buddhist temple language; avoid mixing unrelated East Asian roof, gate, statue and ornament styles without a deliberate design reason.
- Natural, restrained palette: aged dark timber, muted red lacquer, weathered terracotta roof tile, warm limestone, aged bronze, deep pond green, layered foliage.
- Materials must show believable variation. Avoid uniform gloss, saturated plastic-looking colors, excessive gold and baked-in dramatic grunge.
- Prefer coherent silhouette, real-world proportions, layered construction and readable negative space over indiscriminate polygon density.
- Keep the temple precinct calm and contemplative. Cinematic atmosphere supports the architecture; fog must not conceal unfinished close-range geometry.

### Architecture language
- Main hall and Tam Quan are the primary architectural heroes.
- Use a consistent structural grammar: stone plinth and steps; timber columns, beams and bracket sets; layered roof structure; clay/terracotta tiles; restrained carved and painted details.
- Roof curvature must be continuous and structurally plausible. Eaves, ridge, hips, roof-end ornaments and tile rows must read as constructed parts, not a single thin curved sheet.
- Repeated beams, brackets, columns, balusters and tiles should be modular/instanced where this improves authoring and runtime cost.
- Signboards and inscriptions require human review for Vietnamese wording, typography and cultural accuracy. Never generate pseudo-text and present it as authentic calligraphy.

## 2. Fixed first-region composition

Do not move these anchors while replacing blockout geometry:

| Landmark | Existing game-space anchor | Production rule |
|---|---:|---|
| Tam Quan | (0, 0, 20) | Arrival silhouette; preserve central passage and spawn |
| Courtyard | (0, 0, 0) | Open navigable foreground; keep route readable |
| Main hall | (0, 0, -22) | Primary focal point; preserve entry and ramp |
| Lotus pond | (-18, 0, 4) | Keep pond footprint and edge path |
| Region bounds | (-120, -5, -120) to (120, 60, 120) | Existing AABB remains authoritative |

The first playable visual route remains: **Tam Quan → courtyard → main hall → lotus pond**. Secondary pavilions, quiet garden and mountain retreat remain supporting destinations. Do not move spawn points, collision, navmesh or interaction coordinates as part of a visual-only asset pass.

### Composition hierarchy
1. **Foreground:** paving, low stonework, lanterns and selected foliage framing the entrance.
2. **Midground:** Tam Quan, courtyard trees and the main hall as the focal silhouette.
3. **Side composition:** lotus pond, bridge/edge path and garden props; keep the route unobstructed.
4. **Background:** ridges, forest layers and mountain-retreat silhouette; atmospheric perspective and lower geometry density.

Scatter must respect authored exclusion zones around the main path, building footprints, pond, spawn points, interactables and navmesh. Hero trees and landmark props are placed deliberately; background vegetation may be seeded and procedural.

## 3. Asset tiers and acceptance

### Tier H — Hero
Examples: Tam Quan, main hall, principal Buddha/statue, landmark Bodhi tree, major bridge, hero bell.
- Custom silhouette and close-up detail; no primitive-only construction.
- Intentional mesh separation and pivots; clean normals; no accidental holes or intersections visible at camera distance.
- UVs authored for the surface type; no degenerate UV triangles; controlled seams and texel density; UV overlap only where intentional.
- PBR materials suitable for glTF metallic-roughness. Prefer authored/packed image maps for hero surfaces; procedural Blender-only nodes must be baked or replaced before GLB export.
- Close-up render review from at least three angles plus a material/UV inspection.
- Separate collision and visual geometry. LODs are required when profiling justifies them, not generated blindly.

### Tier E — Environment
Examples: secondary halls, walls, paving, lanterns, benches, small trees, rocks, garden props.
- Reusable modular geometry, shared material libraries and trim sheets.
- Consistent scale, pivots, UVs and instancing strategy.
- LOD/culling based on measured visibility and performance.

### Tier B — Background
Examples: distant mountains, far forest, distant roof silhouettes and terrain layers.
- Silhouette and atmosphere first; avoid hero-level geometry.
- Prefer merged meshes, impostors or low-cost representations when appropriate.

## 4. Material library baseline

| Surface | Base response | Notes |
|---|---|---|
| Aged timber | Non-metallic, medium/high roughness | Grain direction, edge wear and subtle color variation |
| Red lacquer | Non-metallic, medium roughness | Restrained sheen; avoid mirror-like clearcoat |
| Terracotta/clay tile | Non-metallic, high roughness | Tile variation, subtle roughness/normal detail |
| Limestone / weathered stone | Non-metallic, high roughness | Fine grain, edge wear, restrained albedo |
| Aged bronze | Metallic workflow, varied roughness | Patina in creases; highlights not uniformly gold |
| Pond water | Runtime water shader | Reflection/refraction cost measured per quality tier |
| Foliage | glTF-compatible alpha/opaque workflow | Avoid excessive transparent overdraw; wind deformation tested separately |

Use 2K as the normal upper texture target; 4K is reserved for hero surfaces with a demonstrated close-up need. Pack textures and use GPU-compressed delivery formats in the runtime pipeline where supported.

## 5. Lighting and camera baseline

Keep the existing runtime lighting architecture and presets (dawn/day/sunset/night). Do not introduce a parallel lighting manager.
- Establish a neutral daylight material-review setup before tuning cinematic grading.
- Dawn/sunset may use warm key light and cool ambient fill; night relies on controlled local lantern/candle pools, not a uniformly bright scene.
- Volumetric effects, bloom, depth of field and reflections are quality-tier features; mobile must have a graceful fallback.
- Blender preview lights/cameras stay outside GLB export collections.
- Save repeatable overview, entrance, courtyard, main-hall close-up and pond camera views for visual QA.

## 6. Wind and vegetation

- Wind is a shared runtime field, not a separate per-tree animation system.
- Every wind-enabled asset declares a profile: species, stiffness, branch response, leaf response, amplitude and LOD fallback.
- Trunk/root vertices remain comparatively stable; branch and leaf response increases toward tips.
- Do not infer wind readiness from UVs or polygon count. Require authored vertex groups/attributes or a documented shader deformation mask and verify motion in R3F.
- Scatter uses deterministic seeds and authored keep-out zones. Never scatter through walkable routes, doors, steps, building volumes, water or interaction points.

## 7. Production workflow

1. Audit source generator and existing source assets; preserve original files.
2. Generate to a new named `.blend` output; never overwrite the input scene.
3. Inspect geometry, scale, silhouette, normals, UVs and material nodes.
4. Bake/author texture maps required by glTF; pack or copy textures into a controlled export location.
5. Create visual, collision and navmesh collections independently.
6. Produce LODs only when justified and validate each representation.
7. Export GLB to a staging directory.
8. Run Blender-side quality report and repository GLB validator.
9. Render repeatable QA views and inspect them manually.
10. Integrate into the region manifest only after the GLB exists, validates and passes visual QA.
11. Test in R3F for scale, materials, shadows, draw calls, triangles, texture memory, collision and mobile fallback.

## 8. Definition of done

A script finishing without error is not asset acceptance.

An asset may be labelled:
- **PROCEDURAL_BASE:** generated editable geometry; not visually accepted.
- **TECHNICALLY_READY:** UV/material/transform/export checks pass; visual review still required.
- **VISUAL_REVIEW:** rendered and awaiting art-direction approval.
- **HERO_ACCEPTED:** close-up silhouette, detail, material, lighting and runtime review all pass.
- **RUNTIME_ACCEPTED:** HERO_ACCEPTED plus GLB integration, collision/interaction and target-device performance checks.

Never promote status automatically based only on polygon count, presence of a UV layer, or successful GLB export.
