# Buddhist World — trạng thái hiện tại

Cập nhật: 2026-11-17.

**Nguồn trạng thái chuẩn:** [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Tài liệu này tóm tắt các thay đổi gần nhất; không thay thế bằng chứng CI/runtime.

## Cập nhật triển khai theo phase (2026-11-17)

- Auth hiện duy trì một session row ổn định cho mỗi lần đăng nhập; refresh xoay token tại chỗ, không còn dùng session family trong runtime. Login/refresh/logout được tuần tự hóa theo user; có kiểm tra Origin cho auth mutations.
- Server movement có validator navmesh theo triangle, kiểm tra toàn segment và spatial grid; A* pathfinding snap điểm đầu/cuối lên bề mặt triangle thực tế thay vì centroid. Navmesh JSON được kiểm tra version/region, tọa độ, tam giác, manifold và adjacency trước khi sử dụng. Cơ chế collision chỉ kích hoạt khi navmesh thật có mặt; production chặn region join nếu navmesh khai báo nhưng thiếu.
- Asset pipeline có inventory report và manual strict acceptance workflow. Các hero GLB, collision GLB và navmesh hiện vẫn thiếu; blockout vẫn là nội dung đang chạy.
- Static/vegetation LOD chuyển sang tải theo level đang cần, giữ level cũ trong khi tải level mới và có hysteresis/culling.
- GitHub Actions run #2176 (head `03ba549bfa99ea369cdb7e54c6b71c61b8e7050a`) đã pass validate, gồm browser lighting visual QA. Hai job `realtime-soak` và `asset-acceptance` bị skip, không phải pass.
- Sau #2176 đã bổ sung fencing presence/voice, checkpoint owner epoch, tuần tự hóa region join, sửa rejoin giữ vị trí hiện tại, fail-closed khi Redis snapshot lỗi và chuẩn hóa Character motion contract + GLB fallback. CI mới nhất cần hoàn tất trên head hiện tại trước khi xác nhận xanh. Xem [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Các phần đã triển khai

- Profile UI trong HUD: tải hồ sơ, sửa tên hiển thị, lưu qua API và đồng bộ Zustand.
- Auth/session: register/login, refresh rotation/reuse detection, logout/session revocation.
- Checkpoint và vị trí: lưu region, checkpoint, tọa độ và yaw; autosave mỗi 15 giây, khi disconnect và trước khi đổi region.
- Integration tests PostgreSQL + Redis: auth, session, profile, checkpoint, Redis revocation, reconnect, duplicate socket và remote animation.
- Multiplayer: Socket.IO Redis adapter, distributed socket ownership/fencing, Redis presence, single-active-socket, remote animation snapshot, reconnect và spatial-hash interest lookup. Các thao tác checkpoint/world interaction kiểm tra owner token và heartbeat hiện hành. Chưa chạy soak test hoặc xác nhận tải multi-instance.
- Region loading: manifest asset GLB theo region, transform/collider, loader chỉ mount region đang active; progressive 3-level LOD có lazy loading, hysteresis và culling. Chưa có chunk streaming/HLOD/occlusion; blockout vẫn giữ do asset thật chưa được tích hợp.
- Blender pipeline: có asset/texture/animation validation và batch export scripts.
- GLB validation: kiểm tra model môi trường và nhân vật; CI có bước chạy validator.
- Performance diagnostics: quality profiles, adaptive step-down và DEV overlay đo FPS/frame time/draw calls/triangles/geometry/texture counters.

## Bằng chứng kiểm thử

- GitHub Actions run #202 đã pass các bước install, typecheck, unit, PostgreSQL + Redis integration và production build trên source cũ.
- Run #204 cũng pass trên commit tài liệu tiếp theo.
- GitHub Actions run #222 đã pass: typecheck, unit tests, PostgreSQL/Redis integration tests, GLB validator và production builds.

## Chưa nghiệm thu / giới hạn

- Chưa có GLB nhân vật hoặc hero environment thật trong `apps/web/public/assets`; GLB validator hiện được chạy với `--allow-empty`, không có nghĩa model đã được nghiệm thu.
- Chưa chạy Blender trên một file `.blend` thực để xác nhận export, rig, animation và material.
- Chưa benchmark trên desktop/mobile thật; overlay chỉ cung cấp số liệu khi chạy game.
- Progressive asset LOD đã có source nhưng chưa có GLB thật để đo chất lượng/chuyển mức; chunk streaming, HLOD và occlusion chưa triển khai.
- Redis Socket.IO adapter và distributed socket ownership đã có source; multi-instance scaling chưa được load/soak test.
- Persistent world đã có player location/checkpoint, quest progress, inventory reward transaction và achievement records; shared-world object state persistence chưa triển khai đầy đủ.
- Không chạy migration trên database người dùng/production, không deploy, không merge và không sửa `main` nếu chưa có xác nhận.

## Kiểm thử local

Dùng database có tên chứa `test` riêng và Redis DB `15`; không trỏ integration suite vào database đang sử dụng:

```bat
set BW_TEST_DATABASE_URL=postgres://bw:bw_dev_password@localhost:5432/buddhist_world_test
set BW_TEST_REDIS_URL=redis://localhost:6379/15
pnpm --filter @bw/server test:integration
```

Kiểm tra GLB sau khi có asset:

```bat
pnpm validate:glb -- apps/web/public/assets
pnpm validate:glb -- apps/web/public/assets/characters --character
```

Nếu chưa có GLB, validator sẽ báo không tìm thấy file và trả mã lỗi; chỉ dùng `--allow-empty` trong CI để xác nhận công cụ hoạt động trước khi asset được đưa vào repository.


## Hero Buddha Statue — cập nhật authoring

- **Đã thêm:** blender/scripts/retopologize_buddha_sculpt.py tạo auto-quad review mesh từ sculpt đã hoàn thiện trên bản sao, giữ nguyên file sculpt nguồn.
- **Đã thêm:** blender/scripts/generate_buddha_sculpt_workspace.py tạo workspace mới cho tượng generic ngồi thiền; giữ source riêng, tạo Multires sculpt copy, auto-quad starter bằng Quadriflow khi Blender hỗ trợ, và plinth blockout không nằm trong EXPORT.
- **Đã thêm:** docs/HERO_BUDDHA_SCULPT_RETOPOLOGY.md mô tả sculpt → manual cleanup retopology → UV → bake → PBR → LOD → runtime QA.
- **Đã cập nhật:** docs/BLENDER_PIPELINE.md để liên kết quy trình này.
- **Kiểm tra tự động:** GitHub Actions workflow Blender Script Syntax, run #6, đã PASS bước compileall cho các Blender Python scripts; đây chỉ là kiểm tra cú pháp, không phải Blender runtime test.
- **Chưa thực hiện / chưa nghiệm thu:** chưa chạy script bằng Blender, chưa có file .blend được sinh, chưa có high-poly sculpt do artist chỉnh, chưa có retopology đã sửa edge flow, UV, bake maps, LOD hoặc GLB. Quadriflow nếu chạy thành công chỉ là auto-quad starter, không phải topology production.
- **Không thay đổi:** region manifest, runtime assets, database, production deployment và nhánh main.

Trạng thái Hero Buddha hiện tại: **AUTHORING TOOLING ADDED / BLENDER EXECUTION PENDING / ASSET NOT ACCEPTED**.


## Navmesh pathfinding correction — 2026-11-17

- Sửa endpoint snapping của A* để đo khoảng cách đến bề mặt triangle trong 3D, tránh từ chối điểm hợp lệ gần cạnh tam giác lớn chỉ vì tâm tam giác ở xa.
- Bổ sung test cho tam giác lớn và giới hạn khoảng cách snap.
- Commit source: `b437bc2`; test: `5dffa96`; cập nhật phase status: `d89adc2`.
- CI run #2169 đang chạy; chưa kết luận pass cho các commit này.


## Kết quả kiểm thử mới nhất — 2026-11-17

- CI #2176: validate job PASS, gồm unit tests, PostgreSQL/Redis integration, các asset validators, Blender Python syntax, production builds và browser lighting visual QA.
- `realtime-soak` và `asset-acceptance` được skip; chưa có kết quả tải multiplayer hoặc nghiệm thu asset thật.
- Runtime navmesh validation và active socket-owner checks đã có unit/integration coverage.
- Không migration, không thay đổi dữ liệu DB, không merge hoặc deploy.
