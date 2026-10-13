---
name: devkits-mcp-integration
description: Connect an AI client (Claude Code, Cursor, Codex, OpenCode, Antigravity, VS Code, Gemini CLI, Windsurf, Zed and others) to the DevKits MCP server, or evaluate/add another MCP integration safely. Use when asked to set up, debug or extend MCP connections.
---

# DevKits MCP integration

## The endpoints — do not confuse them
| Endpoint | What it is |
|---|---|
| `https://devkits.hitechcloud.vn/api/mcp` | DevKits' own MCP server (Streamable HTTP, bearer token). Read-only GitHub/Vercel tools, workspace status, workflow prompts. |
| `https://mcp.vercel.com` | Vercel's official MCP server (OAuth). Docs, projects, deployments, logs. |
| Other third-party servers | Evaluate individually (step 3 below). |

## Connecting a client to DevKits
1. Get a token: an operator adds a random value (≥ 32 chars, e.g. `openssl rand -hex 32`) to `DEVKITS_MCP_TOKENS` (comma-separated, one per client) in Vercel and redeploys.
2. Export it locally as `DEVKITS_MCP_TOKEN`; never paste it into a tracked file.
3. Use the client's native package from `integrations/<client>/` in the repository, or the snippet on the workspace's **Kết nối agent** page.
4. Test: list tools (expect 8, all read-only) and call `devkits_workspace_status`.
5. Troubleshoot: 401 → token missing/wrong or header not expanded; 503 → server has no `DEVKITS_MCP_TOKENS`; client lacks remote HTTP support → use the stdio bridge `npx -y mcp-remote <url> --header "Authorization:${AUTH_HEADER}"`.

## Adding another integration
1. Identify the real need; prefer an existing official server or API over building one.
2. Verify the official endpoint, docs, auth model and the minimum scopes.
3. Check maintenance, rate limits, cost and data exposure.
4. Connect with least privilege; test representative calls and failure handling.
5. Document endpoint, scopes and limitations in `docs/`.

## Building custom MCP tools
Explicit schemas (zod), input validation, timeouts, useful errors, `readOnlyHint` annotations. Keep read and write tools separate; write/destructive/production tools need an explicit human approval step. Never expose a shell, the filesystem, databases or credentials.
