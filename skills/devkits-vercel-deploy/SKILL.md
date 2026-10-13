---
name: devkits-vercel-deploy
description: Deploy, verify and troubleshoot HiTechCloud DevKits (or any Next.js app) on Vercel following the preview-first, approval-gated lifecycle. Use when asked to deploy, ship, promote to production, check a deployment, read build logs, or fix a failed Vercel build.
---

# DevKits Vercel deployment

Ship changes to Vercel without surprises: preview first, evidence for every claim, human approval before production.

## Inputs to establish
- Target project (default: `devkits`) and team, repository `hitechcloud-vietnam/devkits`.
- Which change is being shipped (branch / PR / commit).
- Whether the user has approved a **production** deployment in this conversation. Approval for preview is not approval for production.

## Procedure
1. **Inspect state (read-only).** Git status and branch; `vercel_project_info` / `vercel_list_deployments` via the DevKits MCP server, or `vercel project ls`, `vercel ls` if the CLI is linked. Note framework, production branch, domains and their verification.
2. **Check configuration without printing secrets.** List required env var *names* (see `.env.example`): `ANTHROPIC_API_KEY`, `DEVKITS_ACCESS_PASSWORD`, `DEVKITS_SESSION_SECRET`, `DEVKITS_MCP_TOKENS`, optional `GITHUB_TOKEN`, `VERCEL_TOKEN`, `VERCEL_PROJECT`, `VERCEL_TEAM_ID`. Use `vercel env ls` to compare; never `vercel env pull` into a tracked file.
3. **Verify locally.** `npm ci && npm run typecheck && npm test && npm run build`. Stop on failure and fix the cause.
4. **Preview.** Push the branch (Vercel Git integration builds it) or run `vercel deploy`. Record the preview URL.
5. **Check the preview.** Build log has no errors (`vercel_build_log`); `/login` returns 200; unauthenticated `/api/health` returns 401; after login `/api/health` shows live statuses; `/api/mcp` without a token returns 401.
6. **Ask for production approval.** Summarise what changes, the preview evidence, and the rollback path (`vercel rollback` / promote previous deployment).
7. **Production** only after explicit approval: merge to the production branch or `vercel deploy --prod` / `vercel promote <url>`.
8. **Verify production and the domain.** `https://devkits.hitechcloud.vn/login` responds over HTTPS; domain shows `verified: true` in `vercel_project_info`.
9. **Report** exact URLs, deployment ids, checks run and their results, and anything unresolved.

## Failed builds
Read the last ~150 lines of the build log, find the first real error (not the final "exit code 1"), map it to a file/line or config, propose the smallest fix, re-run step 3 locally, then redeploy a preview.

## Never without explicit authorization
Removing domains, editing DNS, rotating or deleting env vars/tokens, deleting projects or deployments, force-pushing, or promoting to production.
