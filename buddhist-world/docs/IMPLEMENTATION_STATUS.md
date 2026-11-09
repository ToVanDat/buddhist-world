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
| 1 | Foundation, auth/session, validation, CI | Source hardening + realtime failure handling đã có source; run #112 xanh (typecheck, tests, build) |
| 2 | Blender asset pipeline | Có quy ước/script; chưa có hero .blend/.glb thật được nghiệm thu |
| 3 | Character rig/animation | Có procedural locomotion + GLB AnimationMixer renderer, clip mapping và fallback; chưa có GLB thật để nghiệm thu |
| 4 | Cinematic temple region | Có blockout, đường đi và các mốc tương tác; chưa có hero environment assets |
| 5 | Controller, camera, interaction, mobile | Keyboard/touch, checkpoint, camera raycast chống xuyên vật thể và reset vận tốc sau correction đã có source; cần test thiết bị |
| 6 | Persistence | Session/location/checkpoint + API cập nhật display name đã có source; cần DB runtime test và nối UI hồ sơ |
| 7 | Multiplayer | Socket.IO, spatial hash, single-active-socket, lỗi join/chat và cleanup timer đã có source; cần multi-client/load/multi-instance test |
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
- Dọn các interval realtime khi HTTP server đóng; timer được `unref()` để không giữ event loop.
- Socket.IO chỉ giữ một kết nối mới nhất cho mỗi user; socket cũ không được join, gửi movement/chat hoặc ghi đè presence/checkpoint.
- Region join xử lý lỗi PostgreSQL và Redis; Redis presence lỗi không làm mất acknowledgement join. Chat fail-closed nếu Redis rate limiter lỗi.
- Local/remote placeholder có locomotion state idle/walk/run/jump; remote animation lấy từ snapshot server.
- Có GLB renderer dùng `AnimationMixer` + `SkeletonUtils.clone` để mỗi người chơi có skeleton riêng; ánh xạ tên clip Blender/Mixamo và fallback clip khi thiếu state.
- Cấu hình `VITE_PLAYER_MODEL_URL` đọc từ `.env` gốc workspace; để trống thì dùng placeholder.
- Camera third-person raycast qua Rapier để thu ngắn camera khi có vật cản; khi server correction thì reset vận tốc client.
- Có `PUT /api/me/profile` cập nhật display name qua user ID trong access token và Zod validation; chưa nối UI hồ sơ.

## CI evidence

- Code head hiện tại đã được GitHub Actions run #112 kiểm tra thành công: install dependencies, typecheck, unit tests và production builds.
- Run #85 cũng xác minh camera raycast và sửa trường `timeOfImpact`; run #108 xác minh GLB clip mapping, profile schema/API và workspace env config.
- GitHub Actions run #64: install dependencies, typecheck, unit tests và production builds đều hoàn tất với kết quả success trên code head nêu trên.
- Head hiện tại `de1f63ef36b0e2db6991452de87271935b727f8d` chỉ bổ sung cập nhật tài liệu sau run #64; không thay đổi source code được kiểm tra.
- CI hiện cài dependencies bằng `pnpm install --no-frozen-lockfile` vì repository chưa có `pnpm-lock.yaml`. Không tự tạo lockfile bằng cách đoán dependency resolution; cần sinh và commit lockfile bằng pnpm 9.15.0 trên môi trường Node/pnpm thực.
- CI xanh xác nhận build và unit tests trong runner GitHub; không thay thế kiểm thử PostgreSQL/Redis thật, multi-client hoặc thiết bị.

## Việc cần xác minh trước khi merge

1. Checkout head mới nhất và chạy typecheck, unit tests, production build trên máy local; CI run #112 đã xanh.
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
- Chưa có hero assets hoặc GLB nhân vật thật; AnimationMixer mới được kiểm chứng bằng typecheck/unit tests, chưa chạy với file GLB thật.
- Profile update API chưa được nối vào UI; chưa có kiểm thử PostgreSQL/Redis tích hợp cho endpoint/session/realtime.
- Chưa xác minh production deployment, backup/restore, observability hoặc khả năng chịu tải.
