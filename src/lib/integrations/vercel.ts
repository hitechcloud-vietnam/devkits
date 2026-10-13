import "server-only";
import { getVercelConfig } from "@/lib/config";
import { getJson } from "@/lib/http";

// Read-only Vercel REST helpers (https://vercel.com/docs/rest-api).
// Nothing here creates, promotes, or deletes resources.

const API = "https://api.vercel.com";

export class VercelNotConfigured extends Error {
  constructor(missing: string) {
    super(`Vercel integration is not configured: ${missing} is not set on the server.`);
  }
}

function auth() {
  const { token, teamId } = getVercelConfig();
  if (!token) throw new VercelNotConfigured("VERCEL_TOKEN");
  return { headers: { Authorization: `Bearer ${token}` }, teamId };
}

function url(path: string, params: Record<string, string | undefined> = {}) {
  const { teamId } = auth();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, teamId })) if (v) qs.set(k, v);
  const s = qs.toString();
  return `${API}${path}${s ? `?${s}` : ""}`;
}

function projectRef(project?: string): string {
  auth(); // report a missing token before a missing project
  const p = project || getVercelConfig().project;
  if (!p) throw new VercelNotConfigured("VERCEL_PROJECT");
  return encodeURIComponent(p);
}

export async function currentUser() {
  const r = await getJson<{ user: { username: string } }>(url("/v2/user"), auth().headers);
  return { username: r.user.username };
}

interface ProjectResponse {
  id: string;
  name: string;
  framework: string | null;
  nodeVersion?: string;
  link?: { type?: string; org?: string; repo?: string; productionBranch?: string };
  targets?: { production?: { url?: string; readyState?: string; createdAt?: number } };
}

export async function projectInfo(project?: string) {
  const p = await getJson<ProjectResponse>(url(`/v9/projects/${projectRef(project)}`), auth().headers);
  const domains = await getJson<{ domains: { name: string; verified: boolean; gitBranch?: string | null }[] }>(
    url(`/v9/projects/${projectRef(project)}/domains`),
    auth().headers,
  );
  return {
    id: p.id,
    name: p.name,
    framework: p.framework,
    node_version: p.nodeVersion,
    git: p.link ? { provider: p.link.type, repo: p.link.org && p.link.repo ? `${p.link.org}/${p.link.repo}` : undefined, production_branch: p.link.productionBranch } : null,
    production: p.targets?.production
      ? { url: p.targets.production.url, state: p.targets.production.readyState, created: p.targets.production.createdAt }
      : null,
    domains: domains.domains.map((d) => ({ name: d.name, verified: d.verified, git_branch: d.gitBranch ?? null })),
  };
}

interface DeploymentsResponse {
  deployments: {
    uid: string;
    url: string;
    state?: string;
    readyState?: string;
    target?: string | null;
    created: number;
    meta?: Record<string, string>;
  }[];
}

export async function listDeployments(opts: { project?: string; limit?: number; target?: "production" | "preview" }) {
  const projectId = decodeURIComponent(projectRef(opts.project));
  const r = await getJson<DeploymentsResponse>(
    url("/v6/deployments", { projectId, limit: String(opts.limit ?? 10), target: opts.target }),
    auth().headers,
  );
  return r.deployments.map((d) => ({
    id: d.uid,
    url: `https://${d.url}`,
    state: d.readyState ?? d.state,
    target: d.target ?? "preview",
    created: new Date(d.created).toISOString(),
    branch: d.meta?.githubCommitRef,
    commit: d.meta?.githubCommitSha?.slice(0, 7),
    commit_message: d.meta?.githubCommitMessage?.split("\n")[0],
  }));
}

interface BuildEvent {
  type: string;
  created: number;
  text?: string;
  payload?: { text?: string };
}

/** Last N build-log lines for one deployment. */
export async function buildLog(opts: { deploymentId: string; lines?: number }) {
  if (!/^[\w-]+$/.test(opts.deploymentId)) throw new Error("Invalid deployment id");
  const events = await getJson<BuildEvent[]>(
    url(`/v3/deployments/${opts.deploymentId}/events`, { builds: "1", limit: "-1" }),
    auth().headers,
    20_000,
  );
  const lines = events
    .map((e) => e.text ?? e.payload?.text)
    .filter((t): t is string => Boolean(t));
  const n = Math.min(opts.lines ?? 120, 400);
  return { total_lines: lines.length, showing_last: Math.min(n, lines.length), lines: lines.slice(-n) };
}
