# HiTechCloud DevKits

Bộ công cụ AI của HiTechCloud: MCP server, Agent Skills và plugin cho mọi nền tảng AI (Claude Code, Cursor, Codex, OpenCode, Antigravity, ZCode, VS Code Copilot, Gemini CLI, Kiro, …), cộng một workspace web tại <https://devkits.hitechcloud.vn> để trò chuyện với AI và quản lý kết nối.

Trọng tâm: dựng, rà soát và triển khai module tích hợp cho HostBill, WHMCS, WordPress và các nền tảng billing khác.

## Cài vào agent của bạn

Claude Code (2.1.275 trở lên):

```text
/plugin install devkits --marketplace hitechcloud-vietnam/devkits
```

Lệnh cho từng nền tảng khác (plugin, extension, power hoặc cấu hình MCP): **[integrations/README.md](integrations/README.md)**.

Mọi nền tảng dùng chung MCP endpoint `https://devkits.hitechcloud.vn/api/mcp` với header `Authorization: Bearer <token>`. Token cá nhân tạo ở workspace web, mục **Kết nối agent**.

## Có gì trong bộ

| Thành phần | Nơi | Ghi chú |
| --- | --- | --- |
| Skills | [`skills/`](skills) | Nguồn duy nhất. Dựng module, dựng từ spec API, rà soát, sửa lỗi, chuyển nền tảng, triển khai module; triển khai Vercel; kết nối MCP; soạn tài liệu |
| MCP server | [`src/app/api/mcp`](src/app/api/mcp/route.ts) | Streamable HTTP, công cụ chỉ đọc (GitHub, Vercel, trạng thái workspace) và prompt quy trình |
| Plugin đa nền tảng | [`plugins/devkits/`](plugins/devkits) | Một thư mục đọc được bởi Claude Code, ZCode, Cursor, Codex, VS Code, Kiro, Antigravity |
| Marketplace | `.claude-plugin/`, `.cursor-plugin/`, `.agents/plugins/` | Claude Code / ZCode / VS Code, Cursor, Codex |
| Gói ở gốc repo | `plugin.json`, `mcp.json`, `gemini-extension.json` | Cài thẳng từ URL repo (Antigravity, Kiro, VS Code, Gemini CLI) |
| Hướng dẫn cho agent | [`AGENTS.md`](AGENTS.md), `CLAUDE.md`, `GEMINI.md` | Quy ước khi làm việc trong repo này |

Các file trong `plugins/devkits/`, các marketplace, `plugin.json`, `mcp.json`, `gemini-extension.json` và `integrations/README.md` được **sinh tự động** từ `skills/` và [`integrations/platforms.json`](integrations/platforms.json):

```bash
node scripts/build-integrations.mjs          # sinh lại
node scripts/build-integrations.mjs --check  # CI: báo lỗi nếu file sinh ra đã cũ
```

## Workspace web (Next.js)

```bash
npm ci
cp .env.example .env.local   # điền giá trị, không commit
npm run dev
npm run typecheck && npm test && npm run build
```

Biến môi trường: xem [`.env.example`](.env.example). Triển khai trên Vercel theo skill [`devkits-vercel-deploy`](skills/devkits-vercel-deploy/SKILL.md).

## Bản quyền

© 2026 Pho Tue SoftWare And Technology Solutions Joint Stock Company (HiTechCloud). HostBill, WHMCS, WordPress và các nhãn hiệu khác thuộc chủ sở hữu tương ứng; DevKits không liên kết hay được bảo trợ bởi các bên đó.
