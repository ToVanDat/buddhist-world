# Cõi Chùa — Thế giới Phật giáo trực tuyến (khung dự án)

Monorepo: `apps/web` (React 19 + R3F + Rapier), `apps/server` (Express 5 + Socket.IO + PostgreSQL + Redis),
`packages/shared` (schema Zod, hằng số, manifest region), `blender/` (pipeline asset), `tools/`, `docs/`.

> Trạng thái thật của từng tính năng: xem [docs/STATUS.md](docs/STATUS.md). Mã nguồn ở đây **chưa được chạy thử** trên máy bạn.

## Yêu cầu
Node ≥ 20.11, pnpm 9 (`npm i -g pnpm`), Docker Desktop (cho Postgres + Redis), Blender 4.x (chỉ khi làm asset).

## Chạy lần đầu
```bash
pnpm install
cp .env.example .env          # Windows PowerShell: copy .env.example .env
# Sửa JWT_ACCESS_SECRET trong .env (xem hướng dẫn trong file)
pnpm infra:up                 # bật Postgres + Redis
pnpm db:migrate               # tạo bảng
pnpm typecheck && pnpm test   # kiểm tra
pnpm dev:server               # terminal 1  → http://localhost:3001/api/health/ready
pnpm dev:web                  # terminal 2  → http://localhost:5173
```
Mở **hai trình duyệt** (hoặc một cửa sổ ẩn danh), đăng ký hai tài khoản khác nhau → hai khối nhân vật sẽ thấy nhau.

## Cấu trúc
```
apps/web/src/game/      core(input) · rendering(quality) · world · characters · multiplayer · camera
apps/server/src/        config · db(migrations) · modules(auth,me,health) · realtime(gateway,movement)
packages/shared/src/    constants · regions(manifest) · schemas(Zod + sự kiện socket)
blender/                projects · assets · scripts(validation, export) · exports · references
```
