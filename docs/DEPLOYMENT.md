# Triển khai DevKits lên Vercel

Tài liệu này mô tả các bước cho người có quyền trên team Vercel của HiTechCloud và trên DNS của `hitechcloud.vn`. Quy trình đầy đủ (preview trước, duyệt rồi mới production) nằm trong skill [`devkits-vercel-deploy`](../skills/devkits-vercel-deploy/SKILL.md).

## 1. Tạo project và nối GitHub

1. Vercel → **Add New → Project** → import `hitechcloud-vietnam/devkits`. Framework: Next.js (tự nhận). Production branch: `main`.
2. Mỗi pull request sẽ có một Preview deployment.

## 2. Cơ sở dữ liệu

Vercel → **Storage / Marketplace → Neon (Postgres)** → tạo database và gắn vào project. Biến `DATABASE_URL` được thêm tự động. Bảng được tạo ở request đầu tiên (migration trong `src/lib/db/schema.ts`).

## 3. Biến môi trường

Đặt cho cả Preview và Production (xem `.env.example`):

| Biến | Bắt buộc | Ghi chú |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Có | Khoá Claude API |
| `DEVKITS_SESSION_SECRET` | Có | `openssl rand -base64 48`; khác nhau giữa Preview và Production |
| `DATABASE_URL` | Có | Do Neon thêm |
| `DEVKITS_OPS_BOOTSTRAP_EMAIL`, `DEVKITS_OPS_BOOTSTRAP_PASSWORD` | Lần đầu | Tạo người vận hành đầu tiên ở lần đăng nhập `/ops/login` đầu tiên, sau đó xoá mật khẩu khỏi môi trường |
| `DEVKITS_PUBLIC_URL` | Nên có | `https://devkits.hitechcloud.vn`, dùng trong link mời |
| `GITHUB_TOKEN` | Không | Token chỉ đọc, tránh giới hạn tốc độ |
| `VERCEL_TOKEN`, `VERCEL_PROJECT`, `VERCEL_TEAM_ID` | Không | Cho công cụ xem deployment và build log |

## 4. Domain

Vercel → Project → **Settings → Domains** → thêm `devkits.hitechcloud.vn`, rồi tạo bản ghi DNS theo hướng dẫn Vercel hiển thị (thường là `CNAME devkits → cname.vercel-dns.com`). Hiện tại domain này chỉ trả về một địa chỉ IPv6 link-local, chưa trỏ tới Vercel.

## 5. Kiểm tra sau triển khai

- `https://devkits.hitechcloud.vn/login` và `/ops/login` trả 200.
- `/api/ops/health` chưa đăng nhập trả 401; sau khi đăng nhập trang vận hành, mọi kiểm tra kết nối ở **Tổng quan** đều chạy thật.
- Mời một người dùng, nhận lời mời, tạo token ở **Kết nối agent**, cài plugin Claude Code và gõ `/mcp`: thấy server `devkits`.
- `/api/mcp` không có token trả 401.

## 6. Hai portal trên hai domain (tuỳ chọn)

Mặc định portal vận hành nằm ở `/ops`. Muốn tách sang `ops.devkits.hitechcloud.vn`, thêm domain đó vào cùng project và giới hạn `/ops` theo host trong `src/proxy.ts`. Cookie hai portal vốn đã tách riêng.
