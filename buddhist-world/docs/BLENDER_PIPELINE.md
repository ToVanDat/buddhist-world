# Pipeline Blender → Web
1. Làm việc trong `blender/projects/*.blend`; đặt asset vào Collection `EXPORT_<tên>`.
2. Kiểm tra: `blender -b projects/X.blend --python scripts/asset_validation.py` (+ `texture_validation.py`, `animation_validation.py` cho nhân vật). Phải PASS.
3. Export: `blender -b projects/X.blend --python scripts/batch_export.py -- --out exports/environments`
4. Nén (cần `npm i -g @gltf-transform/cli`; KTX2 cần `toktx` từ KTX-Software):
   `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2`
   (Không dùng đồng thời Draco và Meshopt cho cùng mesh. Frontend cần `useGLTF` với meshopt/ktx2 decoder — thêm ở Phase 2.)
5. Kiểm tra GLB: `pnpm validate:glb blender/exports/environments` (thêm `--character` cho nhân vật).
6. Copy vào `apps/web/public/assets/...`, tải thử trong game, chụp ảnh và đo FPS trước khi đánh dấu VERIFIED.


## Procedural temple interaction asset pass
Từ file blockout Phase 1, chạy script tạo mesh sơ bộ cho chuông, lư hương, tượng Phật, bàn thờ và chú tiểu. Script không ghi đè file nguồn:

```bat
set "BW_BLEND_OUTPUT=blender/projects/temple_interactions_generated.blend"
blender -b blender/projects/temple_complex.blend --python blender/scripts/generate_interaction_assets.py
blender -b blender/projects/temple_interactions_generated.blend --python blender/scripts/asset_validation.py
blender -b blender/projects/temple_interactions_generated.blend --python blender/scripts/batch_export.py -- --out blender/exports/models
```

Năm collection được xuất riêng: `bell_main.glb`, `incense_burner.glb`, `buddha_statue.glb`, `altar_main.glb`, `npc_monk_guide.glb`. Nếu file Phase 1 của bạn nằm ở đường dẫn khác, thay `blender/projects/temple_complex.blend` bằng đường dẫn thực tế. Script tạo procedural mesh và vật liệu Principled cơ bản; đây là asset base để chỉnh sửa, chưa phải bản production cuối (chưa có sculpt/retopology, texture bake PBR hoàn chỉnh, rig/animation NPC hoặc kiểm tra trong game). Chỉ thêm GLB vào region manifest sau khi validator PASS và đã xem thử trong Blender lẫn web runtime.


### Coordinate convention and NPC guide rig
Game world coordinates are Y-up. Blender's native scene is Z-up, so the interaction generator maps game `(x, y, z)` to Blender `(x, -z, y)` before export. The GLB exporter then writes glTF Y-up coordinates. Do not remove this conversion unless the entire asset pipeline is changed together.

The monk guide generator creates a simple armature with rigid-part vertex groups and six named NLA clips: `npc_monk_idle`, `npc_monk_walk`, `npc_monk_talk`, `npc_monk_pray`, `npc_monk_work`, and `npc_monk_rest`. The GLB exporter writes NLA strips so the runtime AnimationMixer can select these actions independently. It is a blockout rig for validating the export/runtime animation path, not a final deforming character rig. Final quality still requires a properly modeled character, clean topology, skin weights, facial details, walk/talk/gesture clips, and visual review in Blender and R3F.


## Final temple collision and NPC navigation pipeline

Keep the three geometry roles separate in the Blender scene:

- `EXPORT_<asset_id>`: visible hero/environment meshes, UVs and PBR materials.
- `COLLISION_<region_id>`: simplified collision-only meshes. Remove trim, carvings, foliage and tiny details; keep doorways, walls, steps, railings and solid obstacles. Do not use the render mesh as a high-density trimesh collider.
- `NAVMESH_<region_id>`: only surfaces NPCs are allowed to walk on. Use clean, upward-facing walkable faces; exclude water, stairs steeper than the chosen slope limit, altar tops, roofs, flower beds and inaccessible interiors.

Export visual and collision GLBs separately:

```bat
blender -b projects/temple_complex.blend --python scripts/batch_export.py -- --out exports/temple_complex
```

This creates `exports/temple_complex/models/*.glb` and `exports/temple_complex/collision/<region>_collision.glb`. Register a collision-only asset with `collision: true, render: false` in the region manifest. A visible environment asset can use `collision: false` when a matching simplified collision asset is present; this avoids generating Rapier trimeshes from decorative geometry.

Bake navigation from the final Blender geometry:

```bat
blender -b projects/temple_complex.blend --python scripts/export_navmesh.py -- --region temple_complex --out apps/web/public/assets/navmesh/temple_complex.json --max-slope 42
pnpm validate:navmesh -- exports/navmesh
```

The exporter reads the explicitly authored `NAVMESH_temple_complex` collection, evaluates modifiers and world transforms, converts Blender Z-up coordinates into game/glTF Y-up metres, triangulates walkable surfaces, rejects steep faces, builds shared-edge adjacency, and reports disconnected components. The validator checks schema, finite vertices, triangle winding/area, neighbor reciprocity and non-manifold topology.

Do not create the NAVMESH collection by copying the entire floor/render mesh. Author walkable surfaces deliberately and inspect disconnected components in Blender. Boundary edges are valid; edges shared by more than two triangles are not. The current repository has no final temple .blend or baked navmesh, so CI allows the navmesh folder to be empty. A skipped empty-folder validation is not an asset acceptance result.

Only after a real navmesh is exported and reviewed should the server consume it for NPC A* routing. Until then, existing schedule waypoint routes remain the active fallback; they are not obstacle-aware.


Validate the generated monk activity clips after export:

```bat
pnpm validate:glb -- blender/exports/temple_complex/models/npc_monk_guide.glb --npc
```

The `--npc` mode requires a skinned skeleton with a root bone and all six activity clips. CI also checks this mode when a character GLB is committed under `apps/web/public/assets/characters`; an absent character folder is explicitly skipped, not counted as a passed character asset.


Collision GLBs can be checked independently:

```bat
pnpm validate:glb -- apps/web/public/assets/collision --collision
```

Collision validation rejects skins, animation clips, textures and meshes above 50,000 triangles. Keep collision geometry intentionally simple; use box/capsule colliders for simple primitives in gameplay code whenever possible, and reserve trimeshes for static architectural shapes.


## Generate the temple environment base from an empty Blender scene

The repository now includes an editable procedural architecture generator. It refuses to run against a non-empty user-authored scene and saves to a separate output file:

```bat
blender -b --python blender/scripts/generate_temple_complex.py -- --out blender/projects/temple_complex_generated.blend
set "BW_BLEND_OUTPUT=blender/projects/temple_interactions_generated.blend"
blender -b blender/projects/temple_complex_generated.blend --python blender/scripts/generate_interaction_assets.py
blender -b blender/projects/temple_interactions_generated.blend --python blender/scripts/asset_validation.py
blender -b blender/projects/temple_interactions_generated.blend --python blender/scripts/batch_export.py -- --out apps/web/public/assets
blender -b blender/projects/temple_interactions_generated.blend --python blender/scripts/export_navmesh.py -- --region temple_complex --out apps/web/public/assets/navmesh/temple_complex.json --max-slope 42
pnpm validate:glb -- apps/web/public/assets/models
pnpm validate:glb -- apps/web/public/assets/characters --npc
pnpm validate:glb -- apps/web/public/assets/collision --collision
pnpm validate:navmesh -- apps/web/public/assets/navmesh
```

The generator creates an original Vietnamese temple-complex base aligned with the current game region: Tam Quan, courtyard, raised main hall, timber columns/beams, layered curved roofs, central door, approach path, pond and lanterns. It writes separate render, collision and walkable-surface collections. NPC routes are intentionally restricted to a clear gate opening, courtyard corridors, an accessible ramp and the main hall's central aisle.

This is a procedural architecture and rigging foundation, not a final art-approved asset. Before enabling it in the region manifest, open the generated .blend, inspect roof normals/materials and proportions, run the Blender validators, export the GLBs/navmesh, validate them, and visually test the collision and navigation in the game. The current CI checks script syntax and validator behavior only; it does not execute Blender or certify the generated geometry.


After all generated files have been reviewed and copied into the web public assets, the region manifest can reference them separately. Example only — do not enable these paths until the corresponding GLBs exist and pass validation:

```ts
assets: [
  { id: "temple-visual", src: "/assets/models/temple_complex.glb", collision: false },
  { id: "temple-collision", src: "/assets/collision/temple_complex_collision.glb", collision: true, render: false },
],
blockout: false,
```

Set `VITE_NPC_MODEL_URL=/assets/characters/npc_monk_guide.glb` only after the generated character GLB passes `--npc` validation and its skeleton scale/orientation has been checked in R3F. Keep the blockout enabled until both visual and collision assets load correctly in the game.


## Hero Buddha Statue — neutral sculpt and retopology

The current art direction is a generic, seated-meditation statue with no supplied reference. From the repository root, first enter the buddhist-world project folder (the folder containing pnpm-workspace.yaml). Generate a separate workspace from an empty Blender scene; the script does not overwrite a source .blend:

    cd buddhist-world
    blender -b --python blender/scripts/generate_buddha_sculpt_workspace.py -- --out blender/projects/hero_buddha_neutral_workspace.blend --levels 2 --voxel-size 0.035 --target-faces 14000
    blender blender/projects/hero_buddha_neutral_workspace.blend

The workspace contains a voxel-remeshed neutral body, a Multires sculpt copy, a Quadriflow auto-quad starter (when supported by the installed Blender build), and a plain pedestal blockout. It intentionally does not create canonical iconography, a final face, a named mudra, a finished robe, final UVs, baked maps or production LODs.

Follow docs/HERO_BUDDHA_SCULPT_RETOPOLOGY.md. The automatic quad result must be manually inspected and cleaned after the high-poly sculpt is approved. Do not put the blockout in the runtime manifest or rename it as an accepted export asset. The complete acceptance sequence is sculpt review → final quad retopology → UV review → normal/AO and PBR bake → LOD0/1/2 review → GLB validation → R3F visual/performance review.

This repository update adds the generator and authoring instructions only. Blender has not been executed in this environment; no .blend, sculpt, final retopology, bake, GLB or runtime acceptance is claimed.
