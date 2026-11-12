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


## 9. Tam Quan — hero production specification

Tam Quan is the first architecture benchmark. The current Blender generator is only a procedural blockout source; the following specification defines the production target and must not be interpreted as an acceptance report.

### Design and reference control
- Select one coherent Vietnamese temple lineage/region as the visual reference basis before sculpting final ornament. Do not mix northern, central and southern roof profiles or imported Chinese/Japanese details indiscriminately.
- Record reference source, photographer/rights, date, architectural feature and reviewer notes in the asset brief.
- Establish front, rear, side and three-quarter orthographic studies plus a human-height scale figure before final modeling.
- The three passage hierarchy must read clearly at distance; the central passage remains unobstructed and aligned to the fixed game anchor.
- Signboard wording, couplets, lotus motifs, guardian motifs and any Buddhist iconography require Vietnamese language and cultural review. Blank signage is preferable to invented pseudo-calligraphy.

### Required construction layers
1. **Foundation:** stepped stone plinth, separate paving/threshold, dressed corner stones, believable joints and chipped/worn edges.
2. **Columns:** stone footings, base rings, timber shafts with plausible taper, necking, capitals and visible load transfer into bracket assemblies.
3. **Timber frame:** front/rear tie beams, transverse beams, lintels, purlins and rafters. Joints must read as a coherent construction system; decorative pieces must not float or intersect visibly.
4. **Bracket sets:** layered dougong/corbel assemblies with distinct bearing blocks, arms and caps. Avoid a stack of identical cubes; introduce controlled profiles, joinery and reviewed ornament.
5. **Roof:** continuous structural substrate, visible rafter/eave depth, curved roof planes, individually readable tile courses, ridge and hip caps, end ornaments and finished fascia. Tile courses need controlled gaps, overlap and scale variation.
6. **Signage and ornament:** authored, reviewed Vietnamese text and motifs, modeled or texture-backed with correct orientation and legibility.
7. **Surface storytelling:** localized weathering at rain edges, foot contact, joints and shaded recesses. Avoid uniform procedural noise or indiscriminate grunge.

### Hero material targets
- Timber: directional grain, restrained roughness variation, edge polish and localized age; no flat single-color lacquer.
- Terracotta: subtle per-tile hue/roughness variation, fired-clay micro-normal and darker overlap/contact seams.
- Stone: broad mineral variation, fine grain, softened edges and restrained moss only in plausible damp zones.
- Bronze: controlled metallic response with darker patina in recesses; no uniformly bright gold.
- Hero texture sets: author at 2K by default; reserve 4K for demonstrable close-up needs. Pack maps consistently and verify glTF metallic-roughness, normal and occlusion interpretation in the target renderer.

### Required deliverables
- Editable master `.blend` with named, logically separated structural components.
- Visual mesh collection plus separate simplified collision and walkable-surface collections.
- Authored UVs with inspected seams, no degenerate UV triangles, measured texel density and documented intentional overlaps.
- PBR texture set or verified glTF-compatible material representation; no Blender-only procedural nodes left as assumed production materials.
- LOD0/LOD1/LOD2 only after screen-size and target-device profiling; each LOD must preserve the three-bay silhouette and roof outline.
- GLB export plus validation report, texture manifest, triangle/draw-call/texture-memory budget and source revision.
- Neutral material-review renders: front, rear, left/right three-quarter, side silhouette, human-height entrance and close-ups of roof tile, bracket joint, column base and signboard.
- Runtime captures in R3F at the actual temple approach camera, with scale, lighting, shadows, material response and collision/clearance checked.

### Acceptance gates
| Gate | Pass condition | Evidence |
|---|---|---|
| G0 — Design lock | Coherent Vietnamese reference family, approved proportions and signboard brief | Reference board + signed review notes |
| G1 — Blockout | Three bays, human scale, roof silhouette, anchor and clear passage correct | Orthographic + human-height renders |
| G2 — Construction | Roof/frame/columns/brackets connect plausibly; no visible floating/intersections | Close-up renders + Blender inspection |
| G3 — Surface | UVs, texel density, PBR maps and weathering pass review | UV sheet + texture set + material renders |
| G4 — Optimization | LODs and budgets measured; collision/navmesh separate | LOD captures + metrics report |
| G5 — Export | GLB and all referenced textures load correctly | GLB validator + target-renderer capture |
| G6 — Runtime | Scale, lighting, camera, passage and target-device performance accepted | R3F captures + performance profile |

No single automated validator can pass G0, G1, G2 or the visual parts of G3/G5/G6. The current source generator has not yet produced evidence for these gates.
