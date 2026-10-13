import "server-only";
import { getGithubConfig } from "@/lib/config";
import { getJson } from "@/lib/http";

// Read-only GitHub REST helpers. Results are trimmed to the fields the model
// and UI need so tool results stay small.

const API = "https://api.github.com";

function headers(): Record<string, string> {
  const { token } = getGithubConfig();
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "hitechcloud-devkits",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function repoPath(repo?: string): string {
  const r = repo || getGithubConfig().repo;
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw new Error(`Invalid repository "${r}" (expected owner/name)`);
  return r;
}

interface RepoResponse {
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  homepage: string | null;
  open_issues_count: number;
  pushed_at: string;
  language: string | null;
}

export async function repoOverview(repo?: string) {
  const r = await getJson<RepoResponse>(`${API}/repos/${repoPath(repo)}`, headers());
  return {
    full_name: r.full_name,
    description: r.description,
    private: r.private,
    default_branch: r.default_branch,
    url: r.html_url,
    homepage: r.homepage,
    open_issues_and_prs: r.open_issues_count,
    last_push: r.pushed_at,
    language: r.language,
  };
}

interface CommitResponse {
  sha: string;
  html_url: string;
  commit: { message: string; author: { name: string; date: string } | null };
}

export async function listCommits(opts: { repo?: string; branch?: string; limit?: number }) {
  const params = new URLSearchParams({ per_page: String(opts.limit ?? 10) });
  if (opts.branch) params.set("sha", opts.branch);
  const commits = await getJson<CommitResponse[]>(`${API}/repos/${repoPath(opts.repo)}/commits?${params}`, headers());
  return commits.map((c) => ({
    sha: c.sha.slice(0, 7),
    message: c.commit.message.split("\n")[0],
    author: c.commit.author?.name,
    date: c.commit.author?.date,
    url: c.html_url,
  }));
}

interface PullResponse {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  user: { login: string } | null;
  head: { ref: string };
  updated_at: string;
}

export async function listPullRequests(opts: { repo?: string; state?: "open" | "closed" | "all"; limit?: number }) {
  const params = new URLSearchParams({ state: opts.state ?? "open", per_page: String(opts.limit ?? 10) });
  const pulls = await getJson<PullResponse[]>(`${API}/repos/${repoPath(opts.repo)}/pulls?${params}`, headers());
  return pulls.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.draft ? "draft" : p.state,
    branch: p.head.ref,
    author: p.user?.login,
    updated: p.updated_at,
    url: p.html_url,
  }));
}

interface ContentResponse {
  type: string;
  name: string;
  path: string;
  size: number;
  encoding?: string;
  content?: string;
}

const MAX_FILE_CHARS = 60_000;

/** Lists a directory or returns a text file's contents (truncated, with a notice). */
export async function readPath(opts: { repo?: string; path: string; ref?: string }) {
  const cleanPath = opts.path.replace(/^\/+/, "");
  if (cleanPath.split("/").includes("..")) throw new Error("Path must not contain '..'");
  const params = opts.ref ? `?ref=${encodeURIComponent(opts.ref)}` : "";
  const encoded = cleanPath.split("/").map(encodeURIComponent).join("/");
  const data = await getJson<ContentResponse | ContentResponse[]>(
    `${API}/repos/${repoPath(opts.repo)}/contents/${encoded}${params}`,
    headers(),
  );
  if (Array.isArray(data)) {
    return { type: "directory", path: cleanPath || "/", entries: data.map((e) => ({ name: e.name, type: e.type, size: e.size })) };
  }
  if (data.type !== "file" || data.encoding !== "base64" || data.content === undefined) {
    return { type: data.type, path: data.path, note: "Not a text file that can be displayed." };
  }
  const text = Buffer.from(data.content, "base64").toString("utf8");
  return {
    type: "file",
    path: data.path,
    size: data.size,
    truncated: text.length > MAX_FILE_CHARS,
    content: text.slice(0, MAX_FILE_CHARS),
  };
}
