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

The monk guide generator now creates a simple armature with rigid-part vertex groups and a looping `npc_monk_idle` action (frames 1–120 at 30 FPS). It is a blockout rig for validating the export/runtime animation path, not a final deforming character rig. Final quality still requires a properly modeled character, clean topology, skin weights, facial details, walk/talk/gesture clips, and visual review in Blender and R3F.
