# Kiến trúc
- **Client (apps/web)**: React lo UI; R3F lo render. Input nằm ở object mutable (`game/core/input.ts`), snapshot mạng ở `Map` (`multiplayer/socket.ts`) → không re-render theo frame. Zustand chỉ giữ state "thưa" (auth, cài đặt, trạng thái mạng, danh sách id).
- **Server (apps/server)**: REST (auth, me, health) + Socket.IO. Postgres giữ dữ liệu bền; Redis giữ rate-limit + presence.
- **Mạng**: client gửi `{p, yaw, anim, seq}` ≤15 Hz (volatile). Server kiểm tra (`validateMove`), lưu trạng thái hợp lệ, tick 10 Hz gửi snapshot theo bán kính 80 m trong cùng region. Sai → `player:correct`.
- **Phiên**: access JWT 15' trong RAM client; refresh token ngẫu nhiên, hash SHA-256 trong DB, cookie httpOnly, xoay vòng mỗi lần dùng, dùng lại token cũ → thu hồi cả family.
- **Mở rộng**: thêm region = thêm manifest. Nhiều instance cần: Socket.IO Redis adapter, sở hữu region theo instance (chưa làm).
