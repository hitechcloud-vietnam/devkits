"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Dot, LoadError, Skeleton, cn, type DotTone } from "@/components/ui/primitives";
import { clock } from "@/components/ops/format";

export type CheckStatus = "connected" | "configured" | "not_configured" | "error";
export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  checkedAt: string;
}

const RANK: Record<CheckStatus, number> = { error: 0, not_configured: 1, configured: 2, connected: 3 };
const TONE: Record<CheckStatus, DotTone> = { error: "err", not_configured: "warn", configured: "info", connected: "ok" };
const LABEL: Record<CheckStatus, string> = { error: "Lỗi", not_configured: "Chưa cấu hình", configured: "Đã cấu hình", connected: "Hoạt động" };

/** Fix instructions only where the cause is known from the check id and status. */
export function fixFor(c: HealthCheck): string | null {
  if (c.status === "connected" || c.status === "configured") return null;
  const auth = /\b(401|403)\b/.test(c.detail);
  switch (c.id) {
    case "anthropic":
      return c.status === "not_configured"
        ? "Đặt ANTHROPIC_API_KEY trong biến môi trường của Vercel rồi deploy lại."
        : auth
          ? "Key bị từ chối: tạo key mới trong Anthropic Console, cập nhật ANTHROPIC_API_KEY rồi deploy lại."
          : null;
    case "github":
      return auth ? "Token GitHub bị từ chối: tạo token chỉ đọc mới, cập nhật GITHUB_TOKEN rồi deploy lại." : null;
    case "vercel":
      return c.status === "not_configured"
        ? "Đặt VERCEL_TOKEN và VERCEL_PROJECT trong biến môi trường rồi deploy lại."
        : auth
          ? "Tạo token mới ở vercel.com/account/tokens, cập nhật VERCEL_TOKEN rồi deploy lại."
          : null;
    case "domain":
      return "Thêm devkits.hitechcloud.vn vào project trên Vercel và trỏ bản ghi DNS theo hướng dẫn Vercel đưa ra.";
    case "database":
      return "Kiểm tra DATABASE_URL (Postgres, ví dụ Neon) trong biến môi trường của Vercel.";
    default:
      return null;
  }
}

export function useHealth() {
  const [checks, setChecks] = useState<HealthCheck[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/health", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/ops/login";
        return;
      }
      if (!res.ok) throw new Error(`Máy chủ trả về ${res.status}`);
      setChecks(((await res.json()) as { checks: HealthCheck[] }).checks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi mạng");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { checks, loading, error, reload: load };
}

export function HealthCard({ checks, loading, error, onRetry }: { checks: HealthCheck[] | null; loading: boolean; error: string | null; onRetry: () => void }) {
  const sorted = checks ? [...checks].sort((a, b) => RANK[a.status] - RANK[b.status]) : null;
  const errors = checks?.filter((c) => c.status === "error").length ?? 0;
  const ok = checks?.filter((c) => c.status === "connected" || c.status === "configured").length ?? 0;
  const at = checks?.[0]?.checkedAt;

  let summary = "Đang kiểm tra…";
  if (!loading && checks) summary = `${ok} hoạt động${errors ? ` · ${errors} lỗi` : ""}${at ? ` · kiểm tra lúc ${clock(at)}` : ""}`;
  if (!loading && error) summary = "";

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="text-base font-semibold">Sức khoẻ kết nối</h2>
        {summary && <p className="text-sm text-muted">{summary}</p>}
      </header>
      {error && !loading ? (
        <div className="border-t border-border">
          <LoadError title="Không chạy được kiểm tra kết nối" reason={error} onRetry={onRetry} />
        </div>
      ) : (
        <ul aria-busy={loading} className="divide-y divide-border border-t border-border">
          {loading && !sorted
            ? Array.from({ length: 5 }, (_, i) => (
                <li key={i} className="flex gap-3 px-5 py-4">
                  <div className="mt-1.5 size-2 rounded-full bg-foreground/5" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="w-1/3" />
                    <Skeleton className="w-2/3" />
                  </div>
                </li>
              ))
            : sorted?.map((c) => {
                const fix = fixFor(c);
                const isErr = c.status === "error";
                return (
                  <li key={c.id} className={cn("flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start", isErr && "border-red-100 bg-red-50/60 dark:border-red-500/20 dark:bg-red-500/5")}>
                    <div className="flex min-w-0 flex-1 gap-3">
                      <Dot tone={TONE[c.status]} className="mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <p className="text-sm font-medium">{c.label}</p>
                          <p className={cn("text-xs", isErr ? "font-medium text-red-700 dark:text-red-400" : "text-muted")}>{LABEL[c.status]}</p>
                        </div>
                        <p className="mt-0.5 text-sm text-pretty text-muted [overflow-wrap:anywhere]">{c.detail}</p>
                        {fix && (
                          <p className="mt-2 text-sm text-foreground">
                            <span className="font-medium">Cách sửa:</span> {fix}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 pl-5 sm:pl-0">
                      <time dateTime={c.checkedAt} className="text-xs text-muted tabular-nums">
                        {clock(c.checkedAt)}
                      </time>
                      {isErr && (
                        <Button icon={RefreshCw} loading={loading} onClick={onRetry}>
                          Kiểm tra lại
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
        </ul>
      )}
      <span className="sr-only" role="status">
        {loading ? "Đang kiểm tra kết nối" : ""}
      </span>
    </section>
  );
}
