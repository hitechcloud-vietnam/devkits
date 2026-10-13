import "server-only";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function getAiConfig() {
  const effort = process.env.DEVKITS_EFFORT as Effort | undefined;
  return {
    apiKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.DEVKITS_MODEL || "claude-opus-5-5",
    effort: effort && EFFORTS.includes(effort) ? effort : ("medium" as Effort),
    webSearch: (process.env.DEVKITS_WEB_SEARCH ?? "on").toLowerCase() !== "off",
  };
}

export function getGithubConfig() {
  return {
    repo: process.env.DEVKITS_GITHUB_REPO || "hitechcloud-vietnam/devkits",
    token: process.env.GITHUB_TOKEN || undefined,
  };
}

export function getVercelConfig() {
  return {
    token: process.env.VERCEL_TOKEN || undefined,
    project: process.env.VERCEL_PROJECT || undefined,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
  };
}
