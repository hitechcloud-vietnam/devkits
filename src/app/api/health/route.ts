import Anthropic from "@anthropic-ai/sdk";
import { getAiConfig, getGithubConfig, getVercelConfig } from "@/lib/config";
import * as github from "@/lib/integrations/github";
import * as vercel from "@/lib/integrations/vercel";

export const dynamic = "force-dynamic";

// Live checks only: every "connected" status below comes from a real API call
// made during this request. Nothing is inferred from config files.

export type CheckStatus = "connected" | "not_configured" | "error";
export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  checkedAt: string;
}

async function check(id: string, label: string, fn: () => Promise<{ status: CheckStatus; detail: string }>): Promise<HealthCheck> {
  let result: { status: CheckStatus; detail: string };
  try {
    result = await fn();
  } catch (err) {
    result = { status: "error", detail: err instanceof Error ? err.message : "Check failed" };
  }
  return { id, label, ...result, checkedAt: new Date().toISOString() };
}

export async function GET() {
  const ai = getAiConfig();
  const gh = getGithubConfig();
  const vc = getVercelConfig();

  const checks = await Promise.all([
    check("anthropic", "Claude API", async () => {
      if (!ai.apiKeyPresent) return { status: "not_configured", detail: "Set ANTHROPIC_API_KEY" };
      const model = await new Anthropic({ timeout: 10_000, maxRetries: 0 }).models.retrieve(ai.model);
      return {
        status: "connected",
        detail: `${model.display_name} · effort ${ai.effort}${ai.webSearch ? " · web search on" : ""}`,
      };
    }),
    check("github", "GitHub", async () => {
      const repo = await github.repoOverview();
      return {
        status: "connected",
        detail: `${repo.full_name} (${repo.private ? "private" : "public"})${gh.token ? "" : " · no token, rate-limited"}`,
      };
    }),
    check("vercel", "Vercel", async () => {
      if (!vc.token) return { status: "not_configured", detail: "Set VERCEL_TOKEN and VERCEL_PROJECT" };
      if (!vc.project) {
        const user = await vercel.currentUser();
        return { status: "not_configured", detail: `Token valid (${user.username}); set VERCEL_PROJECT` };
      }
      const project = await vercel.projectInfo();
      const prod = project.production?.state ? ` · production ${project.production.state}` : " · no production deployment";
      return { status: "connected", detail: `${project.name}${prod}` };
    }),
    check("domain", "devkits.hitechcloud.vn", async () => {
      let res: Response;
      try {
        res = await fetch("https://devkits.hitechcloud.vn/login", {
          method: "HEAD",
          redirect: "manual",
          signal: AbortSignal.timeout(8_000),
          cache: "no-store",
        });
      } catch {
        return { status: "error", detail: "Not reachable over HTTPS (DNS, TLS or Vercel domain not configured)" };
      }
      return res.status < 500
        ? { status: "connected", detail: `HTTPS responds (${res.status})` }
        : { status: "error", detail: `HTTPS responded ${res.status}` };
    }),
  ]);

  return Response.json({ checks });
}
