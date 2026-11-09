# Buddhist World — trạng thái hiện tại

Cập nhật: 2026-11-09.

**Nguồn trạng thái chuẩn:** [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Tài liệu này tóm tắt các thay đổi gần nhất; không thay thế bằng chứng CI/runtime.

## Các phần đã triển khai

- Profile UI trong HUD: tải hồ sơ, sửa tên hiển thị, lưu qua API và đồng bộ Zustand.
- Auth/session: register/login, refresh rotation/reuse detection, logout/session revocation.
- Checkpoint và vị trí: lưu region, checkpoint, tọa độ và yaw; autosave mỗi 15 giây, khi disconnect và trước khi đổi region.
- Integration tests PostgreSQL + Redis: auth, session, profile, checkpoint, Redis revocation, reconnect, duplicate socket và remote animation.
- Multiplayer: single-active-socket, remote animation snapshot, reconnect và spatial-hash interest lookup.
- Region loading: manifest asset GLB theo region, transform/collider, loader chỉ mount region đang active; blockout vẫn có thể giữ khi tích hợp asset.
- Blender pipeline: có asset/texture/animation validation và batch export scripts.
- GLB validation: kiểm tra model môi trường và nhân vật; CI có bước chạy validator.
- Performance diagnostics: quality profiles, adaptive step-down và DEV overlay đo FPS/frame time/draw calls/triangles/geometry/texture counters.

## Bằng chứng kiểm thử

- GitHub Actions run #202 đã pass: install, TypeScript typecheck, unit tests, PostgreSQL + Redis integration tests và production builds.
- Run #204 cũng pass trên commit tài liệu tiếp theo.
- Run mới nhất sau khi bổ sung performance overlay và GLB validator đang được CI kiểm tra; xem trạng thái hiện tại trong PR.

## Chưa nghiệm thu / giới hạn

- Chưa có GLB nhân vật hoặc hero environment thật trong `apps/web/public/assets`; GLB validator hiện được chạy với `--allow-empty`, không có nghĩa model đã được nghiệm thu.
- Chưa chạy Blender trên một file `.blend` thực để xác nhận export, rig, animation và material.
- Chưa benchmark trên desktop/mobile thật; overlay chỉ cung cấp số liệu khi chạy game.
- Region loader chưa có chunk/LOD streaming; manifest hiện chưa có GLB asset thực.
- Multiplayer vẫn là một server instance; chưa có Redis Socket.IO adapter, multi-instance scaling hoặc load test.
- Persistent world hiện lưu người chơi; chưa có hệ thống shared object/quest/inventory state hoàn chỉnh.
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
