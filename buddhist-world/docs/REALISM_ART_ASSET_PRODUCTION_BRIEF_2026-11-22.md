# Buddhist World — Realistic Art & Asset Production Brief

**Version:** 1.0 · **Date:** 2026-11-22  
**Purpose:** Blender-ready authoring contract for the vertical slice  
**Route:** Tam Quan → courtyard → Main Hall → Bodhi Garden  
**Visual target:** Cinematic, grounded Vietnamese Buddhist temple; realistic materials and scale, calm composition, readable gameplay  
**Status:** Art direction proposal. This document does not claim assets have been authored or accepted.

## 1. Non-negotiable visual principles

- Grounded realism over fantasy ornament. No exaggerated gold trim, oversized props, floating architecture, neon glows or arbitrary particle spam.
- Respectful Buddhist iconography. References for altar, statues, ritual props, robe details and inscriptions must be reviewed by someone familiar with Vietnamese Buddhist temple architecture and practice before final approval.
- Believable wear: edge polish, rain streaks, dust accumulation, subtle color variation, damp stone near water, moss only in plausible shaded/moist locations.
- Every object has believable scale, weight, contact shadow, collision intent and interaction clearance.
- Keep gameplay silhouettes readable. Do not bury doors, paths, interaction targets or the player in decorative detail.
- Procedural assets are acceptable for blockout, distant foliage and repeatable background detail. Hero monk, main architecture, statues and close-up ritual props require authored assets.

## 2. Hero monk — first asset to author

### Character brief

- One adult male Buddhist monk, calm neutral expression, shaved head, modest layered robe with physically plausible folds and hem length.
- Neutral Vietnamese Buddhist temple styling; robe color and garment construction must be checked against the project's chosen reference tradition before final approval.
- No weapon, armor, fantasy accessories, combat stance or exaggerated hero proportions.
- Character must read clearly at third-person gameplay distance and remain composed in prayer/meditation poses.

### Blender deliverables

1. Editable Blender source with named collections: BODY, ROBE_PRIMARY, ROBE_SECONDARY, ACCESSORIES, RIG, COLLISION_HELPERS.
2. Clean deforming topology, UVs, non-overlapping visible seams, consistent normals and applied transforms.
3. Humanoid skeleton with stable root/pelvis, spine, neck/head, shoulders, arms, hands, fingers, legs and feet. Use consistent bone naming and no negative scale.
4. Hand sockets for prayer beads and incense props; sockets must not deform with the mesh.
5. GLB export with embedded animation clips and packed textures.

### Scale and budgets (initial targets; profile before locking)

| Item | Initial target |
|---|---|
| Standing height | 1.68–1.78 m, including head |
| Hero render LOD | 35k–60k triangles |
| Mid LOD | 12k–20k triangles |
| Far LOD | 3k–7k triangles |
| Hero textures | 2K per material set; avoid unnecessary 4K maps |
| Materials | Prefer 1–3 material slots; combine robe islands where practical |
| Texture channels | Base Color, Normal, ORM (AO/Roughness/Metallic); emissive only if needed |
| Skeleton | One shared humanoid skeleton across monk/NPC variants where feasible |

### Required animation Actions

Use exact names or update the shared animation contract and validators together.

- idle, walk, run, jump
- start_walk, stop_walk, turn_left, turn_right
- pray, kneel, sit, meditate, bow
- interact_reach, interact_hold, interact_release
- Optional NPC actions: talk, work, rest, sweep, garden

Animation acceptance:
- Feet contact the ground without visible sliding during planted phases.
- Robe motion follows torso/hip movement without severe clipping or rubber-like stretching.
- Prayer hands meet at a stable, intentional position; wrists and elbows remain plausible.
- Kneeling/sitting poses do not penetrate floor or props.
- Start/stop/turn transitions blend cleanly and can be interrupted safely.
- Every exported clip has a correct root-motion policy; current gameplay remains controller-driven unless root motion is explicitly designed and tested.

## 3. Environment modules

### Tam Quan
- Modular gate: columns, beams, roof, ridge details and base plinth as separate authorable pieces.
- Plausible timber joinery and roof thickness; avoid a single paper-thin mesh.
- Door/gate opening clearance and collision are authored separately from visual ornament.
- Establish a strong first camera view with a clear path into the courtyard.

### Courtyard
- Ground modules with controlled variation; stone joints and wear should follow foot traffic and drainage.
- Low-frequency surface variation must not create noisy gameplay readability.
- Trees, planters, lamps and benches need believable root/base contact and collision only where necessary.
- Use instancing for repeated distant foliage; unique hero trees should have authored silhouettes.

### Main Hall
- Modular columns, beams, rafters, roof, doors and steps.
- Interior exposure should preserve detail in dark timber while keeping altar focus legible.
- Altar/statues/ritual props need culturally reviewed proportions and placement; no arbitrary symbol generation.
- Ensure walkable aisle and interaction zones remain unobstructed.

### Bodhi Garden
- Layered planting: ground cover, shrubs, mid-height trees and one clear focal tree.
- Avoid uniform repeated tree silhouettes. Vary species, canopy, age and spacing using approved reference.
- Soil, leaf litter, stone and moss should transition naturally.
- Water edge needs a believable shoreline, shallow/deep transition and contact with rocks/vegetation.

## 4. Material library

Use glTF metallic-roughness workflow. Values below are starting points, not universal physical truth; tune against the chosen lighting reference.

| Surface | Metallic | Roughness starting range | Notes |
|---|---:|---:|---|
| Aged timber | 0.0 | 0.62–0.88 | Grain direction, subtle edge wear, avoid glossy plastic |
| Terracotta roof tile | 0.0 | 0.72–0.92 | Firing/color variation, rough chipped edges |
| Limestone / weathered stone | 0.0 | 0.78–0.96 | Porosity, joints, dampness localized near water |
| Bronze bell / fittings | 0.75–1.0 | 0.28–0.58 | Patina in recesses; polished contact edges |
| Lacquered wood | 0.0 | 0.24–0.48 | Restrained highlights; layered wear |
| Soil | 0.0 | 0.88–1.0 | Avoid repeating visible texture tiles |
| Moss / foliage | 0.0 | 0.82–1.0 | Use translucency only when justified |
| Water | 0.0 | 0.08–0.28 | Reflection quality-tier aware; no opaque plastic look |

Texture maps:
- Base Color: sRGB.
- Normal, Roughness, Metallic, AO: linear/non-color.
- Pack AO/Roughness/Metallic into ORM when pipeline supports it.
- No baked lighting in albedo; no duplicate AO darkening.
- Set texture color spaces correctly and inspect normal-map green-channel convention before export.

## 5. Collision, navigation and interaction contracts

- Visual mesh, collision mesh and navmesh are separate deliverables.
- Collision should be low-complexity and stable; never use full ornament mesh as a physics collider.
- Navmesh is derived from final walkable surfaces, not hand-drawn guesses disconnected from architecture.
- Mark doors, thresholds, stairs, ramps, altar clearance and accessible routes explicitly.
- Interaction anchor includes stable ID, position, facing direction, reach radius, animation alignment and server interaction ID.
- Add hand/item sockets for bell, incense, mala and door interactions. Verify hand contact in a real rig before accepting.

## 6. Lighting and camera review

Capture identical camera positions for:
1. Exterior Tam Quan, soft morning light.
2. Courtyard, late-afternoon side light.
3. Main Hall, controlled interior exposure and altar focal point.
4. Bodhi Garden, soft canopy light and water highlights.

Review:
- Shadow direction/softness, contact shadows, exposure continuity and black crush.
- Specular highlights on bronze, timber and wet stone.
- Fog depth and atmospheric perspective without hiding gameplay targets.
- Reflection quality and overdraw on pond/waterfall.
- Color consistency across HDR/SDR displays.

Do not mark Browser Lighting QA complete unless explicitly authorized and actual captures/reports exist.

## 7. Audio production brief

Record or license distinct, clean source assets for:
- Courtyard ambience, interior hall tone, garden ambience.
- Footsteps on stone, timber, soil and wet stone.
- Bell strike with long natural decay.
- Incense/ritual prop handling.
- Wind in trees, leaves, water and rain layers.

Every clip must have provenance/licence, loop points where relevant, loudness target, sample rate, mono/stereo intent and spatialization notes. Synthesized placeholder cues are not accepted as final field recordings. Do not add prayer/chant recordings without explicit rights and cultural review.

## 8. Asset handoff and acceptance

Every asset handoff includes:
- Source Blender file, exported GLB, textures and source/provenance notes.
- Stable asset ID, region, scale, pivot, bounds, LODs and dependencies.
- Material/texture channel report, triangle count and file size.
- Rig/animation report for characters.
- Collision/navmesh reference and validation report where applicable.
- Screenshot turntable and in-engine captures.
- Licence/ownership statement.
- Acceptance state: BLOCKOUT, ART_REVIEW, TECH_REVIEW, RUNTIME_REVIEW, ACCEPTED.

A passing export validator is only a technical gate. It does not prove visual quality, cultural accuracy, animation quality or in-game performance.
