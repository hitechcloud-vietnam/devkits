import "server-only";
import { z } from "zod";
import type { BetaToolUnion } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import * as github from "@/lib/integrations/github";
import * as vercel from "@/lib/integrations/vercel";

// Every client tool here is READ-ONLY. Write operations (merging, deploying,
// changing domains or env vars) are intentionally absent: the assistant may
// only propose them, and a human performs or approves them elsewhere.

interface ToolSpec<S extends z.ZodType> {
  description: string;
  schema: S;
  run: (input: z.infer<S>) => Promise<unknown>;
}

function spec<S extends z.ZodType>(s: ToolSpec<S>): ToolSpec<S> {
  return s;
}

const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/).optional().describe("owner/name; defaults to the DevKits repository");
const limit = z.number().int().min(1).max(50).optional();

const TOOLS = {
  github_repo_overview: spec({
    description: "Get metadata for a GitHub repository: description, visibility, default branch, last push, open issues/PR count.",
    schema: z.object({ repo }).strict(),
    run: ({ repo }) => github.repoOverview(repo),
  }),
  github_list_commits: spec({
    description: "List the most recent commits on a branch (default: the repository's default branch).",
    schema: z.object({ repo, branch: z.string().max(200).optional(), limit }).strict(),
    run: (i) => github.listCommits(i),
  }),
  github_list_pull_requests: spec({
    description: "List pull requests of a repository.",
    schema: z.object({ repo, state: z.enum(["open", "closed", "all"]).optional(), limit }).strict(),
    run: (i) => github.listPullRequests(i),
  }),
  github_read_path: spec({
    description: "Read a file (text, truncated to 60k characters) or list a directory in a repository. Use an empty path for the root.",
    schema: z.object({ repo, path: z.string().max(500), ref: z.string().max(200).optional() }).strict(),
    run: (i) => github.readPath(i),
  }),
  vercel_project_info: spec({
    description: "Get the Vercel project's configuration: framework, linked Git repository, production deployment, and domains with verification status.",
    schema: z.object({ project: z.string().max(100).optional() }).strict(),
    run: ({ project }) => vercel.projectInfo(project),
  }),
  vercel_list_deployments: spec({
    description: "List recent Vercel deployments with state (READY, ERROR, BUILDING...), target, branch and commit.",
    schema: z.object({ project: z.string().max(100).optional(), target: z.enum(["production", "preview"]).optional(), limit }).strict(),
    run: (i) => vercel.listDeployments(i),
  }),
  vercel_build_log: spec({
    description: "Fetch the last lines of a Vercel deployment's build log, to diagnose failed builds.",
    schema: z.object({ deploymentId: z.string().max(100), lines: z.number().int().min(10).max(400).optional() }).strict(),
    run: (i) => vercel.buildLog(i),
  }),
} as const;

export type ToolName = keyof typeof TOOLS;

export function isClientTool(name: string): name is ToolName {
  return Object.hasOwn(TOOLS, name);
}

export function toolDefinitions(opts: { webSearch: boolean }): BetaToolUnion[] {
  const defs: BetaToolUnion[] = Object.entries(TOOLS).map(([name, t]) => ({
    name,
    description: t.description,
    input_schema: z.toJSONSchema(t.schema) as BetaToolUnion extends infer U ? Extract<U, { input_schema: unknown }>["input_schema"] : never,
    // Streamed requests: let inputs stream unbuffered; we validate with zod before running.
    eager_input_streaming: true,
  }));
  if (opts.webSearch) defs.push({ type: "web_search_20260209", name: "web_search", max_uses: 5 });
  return defs;
}

export interface ToolOutcome {
  ok: boolean;
  /** JSON string returned to the model. */
  content: string;
  /** One-line summary for the UI. */
  summary: string;
}

const MAX_RESULT_CHARS = 80_000;

export async function runTool(name: ToolName, input: unknown): Promise<ToolOutcome> {
  const tool = TOOLS[name] as ToolSpec<z.ZodType>;
  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) {
    // Covers truncated/garbled eager-streamed input as well as wrong arguments.
    return {
      ok: false,
      content: JSON.stringify({ INVALID_INPUT: JSON.stringify(input), issues: parsed.error.issues.map((i) => i.message) }),
      summary: "Invalid tool input",
    };
  }
  try {
    const result = await tool.run(parsed.data);
    let content = JSON.stringify(result);
    if (content.length > MAX_RESULT_CHARS) content = `${content.slice(0, MAX_RESULT_CHARS)}… [truncated]`;
    return { ok: true, content, summary: summarize(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed";
    return { ok: false, content: JSON.stringify({ error: message }), summary: message };
  }
}

function summarize(result: unknown): string {
  if (Array.isArray(result)) return `${result.length} item${result.length === 1 ? "" : "s"}`;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.entries)) return `${r.entries.length} entries in ${String(r.path)}`;
    if (Array.isArray(r.lines)) return `${String(r.showing_last)} of ${String(r.total_lines)} log lines`;
    if (typeof r.path === "string") return `${r.path}${r.truncated ? " (truncated)" : ""}`;
    if (typeof r.full_name === "string") return r.full_name;
    if (typeof r.name === "string") return r.name;
  }
  return "done";
}
