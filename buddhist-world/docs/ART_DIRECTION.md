# Art Direction – Vietnamese Buddhist World

## Visual target

A cinematic, realistic Vietnamese Buddhist cultural world for a persistent online experience. The target is physically believable architecture, natural materials, restrained color, atmospheric depth, and readable gameplay silhouettes. “AAA / Unreal-like” is an art-direction ambition, not a claim about current browser rendering or existing assets.

## First playable region: temple complex

Build one coherent, navigable temple precinct before expanding the world:

1. **Tam Quan gate** – primary landmark and arrival silhouette.
2. **Temple courtyard** – clear navigation space, paving, trees, lanterns and seating.
3. **Main hall (Chánh điện)** – visual focal point; detailed roof silhouette, timber structure, tiled roof and layered interior.
4. **Lotus pond** – reflective water, lotus leaves/flowers and a walkable bridge or edge path.
5. **Quiet garden** – smaller contemplative area with stone, vegetation and resting points.

Later regions can expand into a mountain forest, ancient village, lakeside paths and meditation sanctuary. Keep them as separate region packages with explicit boundaries and spawn points.

## Asset tiers

### Hero assets
- Tam Quan, main hall, principal Buddha/statue assets where culturally appropriate, major bridge and landmark trees.
- Highest modeling and material attention; controlled silhouette and close-up readability.
- Use modular construction where repeated beams, columns, roof tiles and railings can be instanced.

### Environment assets
- Secondary halls, walls, paths, stone steps, benches, lanterns, planters, smaller trees, rocks and garden props.
- Reuse trim sheets and material atlases; prefer instancing for repeated objects.

### Background assets
- Distant mountains, forest silhouettes, far village roofs and terrain layers.
- Optimize for silhouette and atmosphere; avoid hero-level geometry for objects that are never approached.

## Material and lighting direction

- Use PBR materials with plausible roughness/metalness; avoid uniformly glossy surfaces.
- Distinguish aged timber, glazed/clay roof tile, weathered stone, plaster, bronze, water and foliage.
- Keep albedo values restrained; use roughness variation and subtle imperfections rather than baked-in dramatic grunge.
- Design a daylight baseline first. Add optional dawn/dusk lighting presets only after the baseline is performant.
- Use fog and atmospheric perspective to conceal region limits naturally, not to hide unfinished close-range geometry.
- Keep readable contrast between player, walkable ground, interactable objects and background.

## Blender production rules

1. Apply object scale and verify Y-up export conventions from `docs/CONVENTIONS.md`.
2. Separate render meshes, collision meshes and export collections.
3. Use consistent object names and explicit export collections.
4. Keep pivots/origins intentional for doors, gates, bells and other interactive props.
5. Create LODs for large repeated environment assets where measurements justify them.
6. Bake or author normal/roughness/ambient-occlusion maps where they materially improve the result.
7. Export GLB and validate transforms, materials, textures, animation clips and file size before adding to the web app.
8. Never commit source photos or third-party assets without checking their licenses and provenance.

## Browser performance budgets

Use the starting budgets in `docs/CONVENTIONS.md` as guardrails, not as proof of performance. Measure actual draw calls, triangles, texture memory, shader cost, load time and frame pacing on target devices. Prefer instancing, texture atlases, compressed textures and region-level loading when profiling shows a benefit.

## Acceptance for the first environment slice

- A complete route from entrance to courtyard, main hall and lotus pond.
- No missing textures, broken normals, unexpected scale or incorrect facing after GLB export.
- Collision geometry blocks the player from walking through walls and major structures.
- Main landmarks remain recognizable at desktop and mobile camera distances.
- The scene loads without placeholder geometry being misrepresented as final art.
- At least one desktop and one mobile performance capture is recorded before claiming the slice is optimized.
