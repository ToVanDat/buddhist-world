# Quy ước
## Tọa độ & đơn vị
- Three.js / glTF: **Y-up, mét, nhìn về −Z**. Blender Z-up → exporter glTF tự đổi (`export_yup=True`).
- Hướng mặt nhân vật: +Z cục bộ. `yaw = atan2(dx, dz)`.
- Camera orbit: `yaw=0` → camera ở +Z nhìn về −Z. Tiến = `(−sin yaw, −cos yaw)`.
- Region: AABB trong `packages/shared/src/regions.ts`. Gốc thế giới (0,0,0) = giữa sân chùa.
## Tên asset (`blender/scripts/_common.py`)
`<loại>_<tên>_<biến thể>` chữ thường: `arch_tamquan_gate_01`, `veg_bamboo_a`, `prop_bell_main`, `char_avatar_f`.
Collection xuất: `EXPORT_<tên>` → `<tên>.glb`. Action nhân vật PascalCase: `Idle`, `Walk`, `Run`, `Jump`.
Bone gốc tên `root`. Scale object phải = 1 (Apply Scale) trước khi export.
## Ngân sách (khởi điểm — phải đo lại trên thiết bị)
Texture ≤ 2048 px (hero ≤ 4096 có lý do). Tam giác: kiến trúc ≤ 40k, nhân vật ≤ 30k, cây ≤ 8k, props ≤ 6k.
GLB môi trường ≤ 15 MB, nhân vật ≤ 8 MB (sau nén). Mobile mục tiêu < 150 draw call (chưa đo).
## Thêm region mới
1. Thêm phần tử vào `REGIONS` (shared). 2. Thêm GLB vào `apps/web/public/assets/environments/` và khai `assets`.
3. Tạo component region trong `apps/web/src/game/world/`. Server tự nhận vì đọc cùng manifest.
