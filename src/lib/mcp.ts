import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { recordUsage } from "@/lib/db/repo";
import { runHealthChecks } from "@/lib/health";
import { runTool, toolSpecs } from "@/lib/tools";

export const MCP_SERVER_NAME = "devkits";
export const MCP_SERVER_VERSION = "0.2.0";

const INSTRUCTIONS = `HiTechCloud DevKits MCP server. Every tool is read-only: it inspects the DevKits GitHub repository and Vercel project but never changes them. Use devkits_workspace_status first to see which integrations are configured. Any change (deploy, merge, DNS, env vars) must be proposed to the human, not claimed as done.`;

/**
 * Builds a fresh MCP server. The endpoint is stateless (one server per HTTP
 * request), which fits serverless functions and needs no session store.
 */
export function createMcpServer(caller: { userId: string | null } = { userId: null }): McpServer {
  // One usage row per tool call; failures to record never fail the call itself.
  const track = (tool: string) =>
    getDb()
      .then((db) => recordUsage(db, { userId: caller.userId, kind: "mcp", tool }))
      .catch((err) => console.error("mcp usage record failed", err instanceof Error ? err.message : err));

  const server = new McpServer({ name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION }, { instructions: INSTRUCTIONS });

  for (const spec of toolSpecs()) {
    server.registerTool(
      spec.name,
      {
        description: spec.description,
        inputSchema: spec.schema.shape,
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async (input: unknown) => {
        const outcome = await runTool(spec.name, input);
        await track(spec.name);
        return { content: [{ type: "text" as const, text: outcome.content }], isError: !outcome.ok };
      },
    );
  }

  server.registerTool(
    "devkits_workspace_status",
    {
      description: "Live health of the DevKits workspace integrations (Claude API, GitHub, Vercel, domain, MCP). Each 'connected' status comes from a real API call made now.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => {
      await track("devkits_workspace_status");
      return { content: [{ type: "text" as const, text: JSON.stringify(await runHealthChecks(), null, 2) }] };
    },
  );

  // Reusable workflows exposed as MCP prompts (slash commands in most clients).
  server.registerPrompt(
    "diagnose-deployment",
    {
      title: "Diagnose a Vercel deployment",
      description: "Find the latest failing DevKits deployment, read its build log and propose a fix.",
      argsSchema: { deployment_id: z.string().optional().describe("Specific deployment id; defaults to the most recent failure") },
    },
    ({ deployment_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Diagnose ${deployment_id ? `Vercel deployment ${deployment_id}` : "the most recent failed DevKits deployment on Vercel"}.
1. Use vercel_list_deployments (and vercel_project_info if useful) to identify it.
2. Read its build log with vercel_build_log.
3. Explain the root cause citing the exact log lines, then propose the smallest safe fix as a diff or commands.
Do not claim anything is fixed or redeployed; I will apply and verify the change.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "repo-briefing",
    {
      title: "DevKits repository briefing",
      description: "Summarise the repository's current state: recent commits, open pull requests and layout.",
      argsSchema: { repo: z.string().optional().describe("owner/name; defaults to hitechcloud-vietnam/devkits") },
    },
    ({ repo }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Give me a briefing on ${repo ?? "the DevKits repository"}: use github_repo_overview, github_list_commits, github_list_pull_requests and github_read_path on the root. Summarise what changed recently, what is in review, and anything that looks risky or unfinished.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "release-readiness",
    {
      title: "Production release readiness",
      description: "Checklist-driven review before promoting DevKits to production.",
      argsSchema: {},
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Assess whether DevKits is ready for a production release. Check devkits_workspace_status, the latest preview and production deployments, open pull requests and recent commits. Produce a go/no-go checklist with evidence for each item, list blockers, and the exact steps a human should run to promote. Do not perform or claim the promotion.`,
          },
        },
      ],
    }),
  );

  return server;
}
