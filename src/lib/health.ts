import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAiConfig, getGithubConfig, getMcpConfig, getVercelConfig } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import * as github from "@/lib/integrations/github";
import * as vercel from "@/lib/integrations/vercel";

// Live checks only: every "connected" status below comes from a real API call
// made during this request. Nothing is inferred from config files.

/** "configured" = settings present but not exercised by a live call. */
export type CheckStatus = "connected" | "configured" | "not_configured" | "error";
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
    result = { status: "error", detail: err instanceof Error ? err.message : "Kiểm tra thất bại" };
  }
  return { id, label, ...result, checkedAt: new Date().toISOString() };
}

export async function runHealthChecks(): Promise<HealthCheck[]> {
  const ai = getAiConfig();
  const gh = getGithubConfig();
  const vc = getVercelConfig();

  const checks = await Promise.all([
    check("anthropic", "Claude API", async () => {
      if (!ai.apiKeyPresent) return { status: "not_configured", detail: "Chưa đặt ANTHROPIC_API_KEY" };
      const model = await new Anthropic({ timeout: 10_000, maxRetries: 0 }).models.retrieve(ai.model);
      return {
        status: "connected",
        detail: `${model.display_name} · effort ${ai.effort}${ai.webSearch ? " · tìm kiếm web bật" : ""}`,
      };
    }),
    check("github", "GitHub", async () => {
      const repo = await github.repoOverview();
      return {
        status: "connected",
        detail: `${repo.full_name} (${repo.private ? "riêng tư" : "công khai"})${gh.token ? "" : " · chưa có token, bị giới hạn tốc độ"}`,
      };
    }),
    check("vercel", "Vercel", async () => {
      if (!vc.token) return { status: "not_configured", detail: "Chưa đặt VERCEL_TOKEN và VERCEL_PROJECT" };
      if (!vc.project) {
        const user = await vercel.currentUser();
        return { status: "not_configured", detail: `Token hợp lệ (${user.username}), chưa đặt VERCEL_PROJECT` };
      }
      const project = await vercel.projectInfo();
      const prod = project.production?.state ? ` · bản production ${project.production.state}` : " · chưa có bản production";
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
        return { status: "error", detail: "Chưa truy cập được qua HTTPS (DNS, TLS hoặc domain trên Vercel chưa cấu hình)" };
      }
      return res.status < 500
        ? { status: "connected", detail: `HTTPS phản hồi (${res.status})` }
        : { status: "error", detail: `HTTPS phản hồi lỗi ${res.status}` };
    }),
    check("database", "Cơ sở dữ liệu", async () => {
      const started = Date.now();
      const db = await getDb();
      await db.query("select 1");
      const kind = process.env.DATABASE_URL ? "Postgres (DATABASE_URL)" : "PGlite cục bộ (chỉ dùng khi phát triển)";
      return { status: "connected", detail: `${kind} · ${Date.now() - started} ms` };
    }),
    check("mcp", "MCP endpoint", async () => {
      const db = await getDb();
      const [r] = await db.query<{ n: string }>(
        "select count(*) as n from mcp_tokens where revoked_at is null and (expires_at is null or expires_at > now())",
      );
      const personal = Number(r.n);
      const service = getMcpConfig().tokens.length;
      return {
        status: "configured",
        detail: `/api/mcp · ${personal} token cá nhân đang hiệu lực${service ? ` · ${service} token dịch vụ` : ""}`,
      };
    }),
  ]);

  return checks;
}
