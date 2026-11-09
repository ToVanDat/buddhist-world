# Trạng thái dự án (theo mục 19 của Master Prompt)
Cập nhật: 2026-11-09. Chỉ ghi VERIFIED khi đã có kết quả test thật.

| Hạng mục | Trạng thái | Ghi chú |
|---|---|---|
| Monorepo, tsconfig, workspace | IMPLEMENTED | Chưa chạy `pnpm install` / `typecheck` (sandbox không có mạng) |
| Shared: schema, regions, hằng số | IMPLEMENTED | |
| Migration 001 (users, profiles, characters, locations, sessions, audit) | IMPLEMENTED | Chưa chạy trên Postgres thật |
| Auth: register/login/refresh xoay vòng/logout | IMPLEMENTED | Chưa test; scrypt N=2^15 |
| Phát hiện tái sử dụng refresh token | IMPLEMENTED | Chưa test |
| Health `/api/health`, `/ready` | IMPLEMENTED | |
| Rate limit REST + chat (Redis) | IMPLEMENTED | |
| Kiểm tra di chuyển phía server (`validateMove`) | **TESTED** | 4 ca chạy bằng Node thuần: PASS. Test vitest đã viết nhưng chưa chạy |
| Socket gateway (join, state, chat, tick, interest 80 m) | IMPLEMENTED | Chưa test 2 client |
| Frontend: Auth UI, HUD, chat, joystick | IMPLEMENTED | Chưa build, chưa xem bằng mắt |
| Character controller + Rapier + camera | IMPLEMENTED | Chưa chạy; dùng capsule **PLACEHOLDER** |
| Địa hình/kiến trúc | **PLACEHOLDER** | Khối hộp thô, không phải asset cuối |
| Quality profiles + PerformanceMonitor | IMPLEMENTED | Ngưỡng chưa đo trên thiết bị thật |
| Blender scripts (validation/export) | IMPLEMENTED | Kiểm tra cú pháp Python OK; chưa chạy trong Blender |
| `tools/validate-glb.mjs` | IMPLEMENTED | Chưa chạy với GLB thật (chưa có GLB) |
| Asset Blender thật (kiến trúc, nhân vật, rig, animation) | NOT STARTED | Cần người/artist làm trong Blender |
| Camera chống xuyên tường, photo mode, IK | NOT STARTED | |
| Audio, nước, thảm thực vật, hiệu ứng khí quyển | NOT STARTED | Phase 4 |
| Friends, events, chat lưu DB, moderation | NOT STARTED | Phase 9 (chat hiện chỉ broadcast, không lưu) |
| Docker production, Nginx, HTTPS, backup | NOT STARTED | Phase 11 |

## Giới hạn đã biết
- **Không phải server-authoritative hoàn toàn**: client mô phỏng vật lý, server *kiểm tra* tốc độ/ranh giới và sửa lại. Chưa kiểm tra va chạm với công trình ở server (cần mesh va chạm phía server – Phase 7/8).
- Tick là O(n²) theo số người cùng region; chưa có spatial grid. Chưa test tải; không tuyên bố sức chứa.
- Trạng thái người chơi giữ trong RAM một instance; Redis mới chỉ giữ presence/rate-limit.
- Chưa có CSRF token riêng; mitigations hiện tại: cookie `SameSite=Lax` + `path=/api/auth` + CORS giới hạn origin.
- Đổi `antialias` làm Canvas mount lại (nhân vật về điểm spawn) — chấp nhận tạm thời.
