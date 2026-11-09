# Buddhist World – Implementation Status

Cập nhật: 2026-11-09. Tài liệu này phân biệt rõ phần đã có trong source với phần cần xác minh runtime hoặc cần tài nguyên bên ngoài.

## Quy tắc triển khai

- Không thay đổi `main` trực tiếp; mọi thay đổi đi qua branch/PR.
- Không chạy migration trên database người dùng khi chưa được yêu cầu rõ ràng.
- Không deploy, merge, xóa dữ liệu hoặc rotate secret ở môi trường đang chạy nếu chưa có xác nhận.
- Không đánh dấu asset, multiplayer, performance hoặc production-ready nếu chưa có test/evidence tương ứng.

## Trạng thái theo phase

| Phase | Phạm vi | Trạng thái |
|---|---|---|
| 0 | Repository/source audit | Source audit đã thực hiện; máy local và runtime chưa xác minh |
| 1 | Foundation, auth/session, validation, CI | Một phần được harden trong branch; cần CI chạy và review |
| 2 | Blender asset pipeline | Script/quy ước có trong source; chưa có asset .blend/.glb thật được xác minh |
| 3 | Character rig/animation | Placeholder avatar; cần Blender và model/animation thực tế |
| 4 | Cinematic temple region | Có blockout; chưa có hero environment assets |
| 5 | Controller, camera, interaction, mobile | Controller/camera và input có trong source; cần thiết bị thực tế để nghiệm thu |
| 6 | Persistence | Profile/session/location schema có; cần DB migration/runtime test |
| 7 | Multiplayer | Socket.IO movement/chat cơ bản có; cần kiểm thử đa client, reconnect, load và multi-instance |
| 8 | Persistent world/streaming | Chưa có world streaming/shared object persistence hoàn chỉnh |
| 9 | Social/community | Chưa triển khai đầy đủ |
| 10 | Desktop/mobile performance | Quality profiles có; chưa có benchmark thiết bị |
| 11 | Production deployment | Chưa thực hiện; cần hạ tầng, secrets, TLS, backup, monitoring và load test |

## Hardening trong branch Phase 1

- Access JWT được ràng buộc với session row (session ID) và kiểm tra trạng thái session cho REST requests.
- Refresh rotation khóa session row trong transaction, tránh hai request đồng thời tạo hai nhánh refresh hợp lệ.
- Logout thu hồi refresh session và phát tín hiệu Redis để giảm thời gian tồn tại access session; socket kiểm tra session định kỳ.
- Rate-limit Redis dùng Lua để INCR/EXPIRE nguyên tử; fail-closed ở production khi Redis không khả dụng.
- Secret trong `.env.example` là placeholder, không phải secret có thể dùng.
- Production bắt buộc secure cookie và secret không phải placeholder.
- CI workflow chạy install, typecheck, test và build.

## Việc cần xác minh trước khi merge

1. Chạy GitHub Actions và xử lý mọi lỗi typecheck/test/build.
2. Test đăng ký/đăng nhập/refresh song song/logout trên PostgreSQL + Redis disposable.
3. Test socket disconnect sau logout/refresh và reconnect cùng tài khoản.
4. Chạy Blender batch export + GLB validation trên máy có Blender.
5. Kiểm tra CORS/cookie trên domain HTTPS thật trước production.
6. Thêm lockfile pnpm được tạo bởi pnpm 9.15.0 rồi chuyển CI sang `--frozen-lockfile`.

## Giới hạn đã biết

- Multiplayer authoritative state vẫn giữ trong RAM của một server instance; Redis chưa phải Socket.IO adapter.
- Nearby interest calculation vẫn O(n²) trong một region.
- Chưa có world streaming, moderation, friends, events hoặc inventory hoàn chỉnh.
- Chưa có asset hero thật; không tuyên bố chất lượng cinematic/AAA dựa trên placeholder geometry.
