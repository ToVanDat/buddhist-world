# Pipeline Blender → Web
1. Làm việc trong `blender/projects/*.blend`; đặt asset vào Collection `EXPORT_<tên>`.
2. Kiểm tra: `blender -b projects/X.blend --python scripts/asset_validation.py` (+ `texture_validation.py`, `animation_validation.py` cho nhân vật). Phải PASS.
3. Export: `blender -b projects/X.blend --python scripts/batch_export.py -- --out exports/environments`
4. Nén (cần `npm i -g @gltf-transform/cli`; KTX2 cần `toktx` từ KTX-Software):
   `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2`
   (Không dùng đồng thời Draco và Meshopt cho cùng mesh. Frontend cần `useGLTF` với meshopt/ktx2 decoder — thêm ở Phase 2.)
5. Kiểm tra GLB: `pnpm validate:glb blender/exports/environments` (thêm `--character` cho nhân vật).
6. Copy vào `apps/web/public/assets/...`, tải thử trong game, chụp ảnh và đo FPS trước khi đánh dấu VERIFIED.
