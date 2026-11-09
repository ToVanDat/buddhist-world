# Buddhist World – Implementation Status

Cập nhật: 2026-11-09. Tài liệu phân biệt phần đã được viết trong source với phần đã được kiểm chứng bằng CI hoặc runtime.

## Quy tắc triển khai

- Không thay đổi `main` trực tiếp; mọi thay đổi đi qua branch/PR.
- Không chạy migration trên database người dùng khi chưa có yêu cầu rõ ràng.
- Không deploy, merge, xóa dữ liệu hoặc rotate secret môi trường đang chạy nếu chưa có xác nhận.
- Không đánh dấu asset, multiplayer, performance hoặc production-ready nếu chưa có bằng chứng test tương ứng.

## Trạng thái theo phase

| Phase | Phạm vi | Trạng thái |
|---|---|---|
| 0 | Repository/source audit | Đã audit source; máy local và runtime chưa xác minh |
| 1 | Foundation, auth/session, validation, CI | Source hardening đã thực hiện; run #61 xanh trên head trước thay đổi graceful shutdown; run #64 đang xác minh head mới |
| 2 | Blender asset pipeline | Có quy ước/script; chưa có hero .blend/.glb thật được nghiệm thu |
| 3 | Character rig/animation | Avatar placeholder; cần model rigged và animation clips |
| 4 | Cinematic temple region | Có blockout, đường đi và các mốc tương tác; chưa có hero environment assets |
| 5 | Controller, camera, interaction, mobile | Controller/camera, keyboard/touch, checkpoint interaction đã có source; cần test thiết bị |
| 6 | Persistence | Profile/session/location và checkpoint persistence có schema/API; cần DB runtime test |
| 7 | Multiplayer | Socket.IO movement/chat và spatial-hash interest lookup có source; cần multi-client/load/multi-instance test |
| 8 | Persistent world/streaming | Chưa có world streaming hoặc shared object persistence hoàn chỉnh |
| 9 | Social/community | Chưa triển khai đầy đủ |
| 10 | Desktop/mobile performance | Quality profiles có; chưa có benchmark thiết bị |
| 11 | Production deployment | Chưa thực hiện; cần secrets, TLS, backup, monitoring và load test |

## Đã bổ sung trong nhánh Phase 1 + gameplay slice

- Access JWT gắn session ID; REST auth kiểm tra session còn hiệu lực.
- Refresh rotation khóa row trong transaction; logout/refresh thu hồi session cũ.
- Socket kiểm tra session và đóng kết nối khi session bị thu hồi.
- Redis rate limit dùng Lua atomic; production fail-closed khi Redis lỗi.
- Express Request được mở rộng type-safe bằng global Express namespace.
- Region manifest có checkpoint đặt tên tại Tam Quan, sân chùa, chính điện và bờ hồ sen.
- Người chơi có thể đến gần checkpoint và nhấn E (desktop) hoặc nút HUD (touch) để lưu vị trí qua API đã xác thực.
- Khôi phục cả tọa độ lẫn hướng nhìn từ checkpoint hợp lệ; checkpoint sai region/id hoặc tọa độ không hữu hạn/vượt bounds sẽ bị bỏ qua.
- Sửa khoảng cách raycast ground detection cho capsule ở spawn height để trạng thái grounded/jump hoạt động đúng.
- Touch sprint chuyển thành thao tác giữ nút và reset khi pointer release/cancel/lost capture.
- Session watcher của Socket.IO tránh chạy chồng; PostgreSQL là nguồn xác thực chính và lỗi DB sẽ ngắt socket.
- Socket cũ không thể xóa presence hoặc ghi đè checkpoint của socket mới khi cùng tài khoản reconnect.
- Vị trí đã lưu được kiểm tra hữu hạn và nằm trong bounds trước khi dùng làm điểm spawn.
- Nearby player lookup dùng spatial hash theo cell thay vì quét toàn bộ cặp người chơi.
- Unit tests bao phủ checkpoint, movement bounds và spatial interest lookup.
- Tiến trình server đóng Socket.IO/HTTP trước, sau đó giải phóng PostgreSQL pool và Redis; shutdown được bảo vệ để không chạy lặp khi nhận nhiều signal.

## CI evidence

- Head trước thay đổi graceful shutdown: `1bcf16f72a7f1c4b43ca11be7ea80c0300b22a68`.
- GitHub Actions run #61: install dependencies, typecheck, unit tests và production builds đều hoàn tất với kết quả success trên head nêu trên.
- Head hiện tại có commit graceful shutdown và cập nhật tài liệu; run #64 được kích hoạt để xác minh các thay đổi mới, chưa được kết luận.
- CI hiện cài dependencies bằng `pnpm install --no-frozen-lockfile` vì repository chưa có `pnpm-lock.yaml`. Không tự tạo lockfile bằng cách đoán dependency resolution; cần sinh và commit lockfile bằng pnpm 9.15.0 trên môi trường Node/pnpm thực.
- CI xanh xác nhận build và unit tests trong runner GitHub; không thay thế kiểm thử PostgreSQL/Redis thật, multi-client hoặc thiết bị.

## Việc cần xác minh trước khi merge

1. Đợi run #64 xác minh head hiện tại; sau đó checkout head và chạy typecheck, unit tests, production build trên máy local.
2. Chạy register/login/refresh đồng thời/logout trên PostgreSQL + Redis dùng riêng cho test.
3. Test checkpoint API và khôi phục vị trí/hướng nhìn sau reconnect/relogin.
4. Test socket disconnect sau logout/refresh và reconnect cùng tài khoản.
5. Test spatial interest với nhiều client ở các cell/region khác nhau.
6. Chạy Blender batch export + GLB validation trên máy có Blender.
7. Kiểm tra CORS/cookie trên domain HTTPS thật.
8. Commit pnpm lockfile được sinh bởi pnpm 9.15.0 rồi chuyển CI sang `--frozen-lockfile`.
9. Xác nhận graceful shutdown trong môi trường chạy thật, gồm SIGINT/SIGTERM và kết nối DB/Redis đang hoạt động.

## Giới hạn đã biết

- Multiplayer authoritative state vẫn ở RAM của một server instance; Redis chưa phải Socket.IO adapter.
- Movement validation kiểm tra bounds và tốc độ nhưng chưa mô phỏng va chạm vật lý phía server.
- Chưa có world streaming, moderation, friends, events hoặc inventory hoàn chỉnh.
- Chưa có hero assets; không tuyên bố chất lượng cinematic/AAA dựa trên placeholder geometry.
- Chưa xác minh production deployment, backup/restore, observability hoặc khả năng chịu tải.
