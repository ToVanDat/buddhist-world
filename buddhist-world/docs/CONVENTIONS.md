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


## Hợp đồng asset Character / Animation

- Mọi character GLB phải dùng glTF Y-up, đơn vị mét; nhân vật nhìn về hướng +Z cục bộ theo controller hiện tại.
- GLB player phải có skin/skeleton và bone gốc `root`; bộ clip bắt buộc: `Idle`, `Walk`, `Run`, `Jump` (runtime nhận alias Blender/Mixamo).
- GLB NPC phải có skin/skeleton và bone gốc `root`; bộ clip bắt buộc: `Idle`, `Walk`, `Talk`, `Pray`, `Work`, `Rest`. `Run` và `Jump` không bắt buộc cho NPC.
- Blender authoring dùng một armature, scale object đã Apply, Action/NLA có tên PascalCase. Collection `EXPORT_char_<id>` hoặc `EXPORT_npc_<id>` được batch exporter đưa vào `assets/characters` cùng skin, animation và morph.
- `AvatarMotion` là trạng thái chuyển động mà controller/NPC snapshot gửi đến renderer; animation clip là dữ liệu bên trong GLB được ánh xạ vào trạng thái đó. Gameplay action (ví dụ tương tác, dâng hương, thỉnh chuông) là sự kiện/gameplay command riêng, không phải tên clip.
- Runtime player dùng `VITE_PLAYER_MODEL_URL`; NPC dùng `VITE_NPC_MODEL_URL`. Nếu GLB đang tải hoặc lỗi, runtime giữ procedural fallback thay vì làm hỏng toàn bộ Canvas.
- Kiểm tra authoring bằng `animation_validation.py`; kiểm tra GLB cuối bằng `pnpm validate:glb -- <file.glb> --character` cho player hoặc `--npc` cho NPC. Chỉ bật URL sau khi GLB thực tế qua validator và đã xem đúng scale/orientation trong R3F.
