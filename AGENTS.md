# AGENTS.md — HiTechCloud DevKits

Instructions for AI coding agents (Codex, Cursor, OpenCode, Antigravity, Gemini CLI, Zed, Copilot, Claude Code via `CLAUDE.md`, and others) working in this repository.

## What this is
DevKits is HiTechCloud's interactive AI workspace, deployed on Vercel at `https://devkits.hitechcloud.vn`.
- Next.js 16 App Router + TypeScript + Tailwind v4, `src/`
- Two independent portals with separate accounts and cookies:
  - user portal `src/app/(user)/` (chat, connect agents), cookie `dk_user`
  - operator portal `src/app/ops/` (overview, accounts, integrations), cookie `dk_ops`
- `src/proxy.ts` routes each path to its portal; `src/lib/auth.ts` re-checks the database
- `src/lib/db/` — Postgres (Neon in production, PGlite locally/tests), migrations, repository
- `src/lib/agent.ts` — Claude agent loop (streaming, tools, refusal fallback)
- `src/lib/tools.ts` — read-only GitHub/Vercel tools shared by chat and MCP
- `src/app/api/mcp/route.ts` — remote MCP server (Streamable HTTP, personal bearer tokens)
- `src/components/ui/` — AppShell and primitives; design follows the evon ui-ux skill tokens
- `skills/` — portable Agent Skills (`SKILL.md`)
- `integrations/` — per-platform plugins, extensions and config

## Commands
```bash
npm ci
npm run typecheck
npm test          # node:test unit tests in tests/
npm run build
npm run dev       # needs .env.local, see .env.example
npm run integrations        # regenerate plugins/marketplaces after editing skills/ or integrations/platforms.json
npm run integrations:check  # CI check that generated files are current
```
Run typecheck, tests and build before proposing a change as done. Deployment: `docs/DEPLOYMENT.md`.

- Content sourcing: `/home/developer` on the maintainer's machine is reference material only. Author new skills and docs in your own words; never copy its files into this public repository.

## Rules
- Never commit secrets. Configuration lives in Vercel env vars; `.env.example` lists names only.
- Tools exposed to the model and over MCP are read-only. Adding a write tool requires an explicit human-approval step and a separate review.
- Never report a deployment, connection or test as successful without evidence (command output, URL, tool result).
- Production deploys, DNS/domain changes, credential rotation and deletions require explicit approval from the operator.
- Keep UI text Vietnamese-first; code, comments and commit messages in English.
- Match surrounding code style; keep changes small and reversible.

## DevKits MCP server
`https://devkits.hitechcloud.vn/api/mcp` with `Authorization: Bearer $DEVKITS_MCP_TOKEN`. Setup per client: `integrations/README.md`.
