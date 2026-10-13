"use client";

import { Bot, Check, ChevronDown, RefreshCw, UserPlus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { Avatar, Button, LoadError, Skeleton, cn } from "@/components/ui/primitives";
import { useAccount } from "@/components/session-context";
import { HealthCard, useHealth, type HealthCheck } from "@/components/ops/health";
import { delta, formatNumber, relativeDay } from "@/components/ops/format";
import { OPS_NAV } from "@/lib/nav";
import { formatUsd } from "@/lib/pricing";

interface UsageStats {
  activeUsers: number;
  chats: number;
  mcpCalls: number;
  costMicros: number;
}
interface OverviewData {
  usage: { current: UsageStats; previous: UsageStats };
  activity: { actorType: "user" | "operator" | "system"; actorName: string; action: string; target: string; createdAt: string }[];
  totals: { users: number; invited: number };
  monthlyBudgetUsd: number | null;
}

function useOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/overview", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/ops/login";
        return;
      }
      if (!res.ok) throw new Error(`Máy chủ trả về ${res.status}`);
      setData((await res.json()) as OverviewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi mạng");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, reload: load };
}

function UsageCard({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  const cur = data?.usage.current;
  const prev = data?.usage.previous;
  const usd = (m: number) => formatUsd(m);
  const items: [string, string, string][] =
    cur && prev
      ? [
          ["Người dùng", formatNumber(cur.activeUsers), delta(cur.activeUsers, prev.activeUsers)],
          ["Cuộc trò chuyện", formatNumber(cur.chats), delta(cur.chats, prev.chats)],
          ["Lượt gọi MCP", formatNumber(cur.mcpCalls), delta(cur.mcpCalls, prev.mcpCalls)],
          [
            "Chi phí Claude",
            usd(cur.costMicros),
            data?.monthlyBudgetUsd ? `Hạn mức tháng ${usd(data.monthlyBudgetUsd * 1_000_000)}` : delta(cur.costMicros, prev.costMicros, usd),
          ],
        ]
      : [];
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="text-base font-semibold">7 ngày qua</h2>
      {loading && !cur ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="w-full" />
          <Skeleton className="w-4/5" />
          <Skeleton className="w-2/3" />
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-4">
          {items.map(([label, value, note]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
              <dd className="text-xs text-muted">{note}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

const PORTAL_LABEL = { user: "DevKits", operator: "Vận hành", system: "Hệ thống" } as const;

function ActivityCard({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  return (
    <section className="flex flex-col rounded-2xl border border-border bg-surface py-5">
      <header className="flex items-start justify-between gap-3 px-5">
        <div className="flex min-h-10 items-center">
          <h2 className="text-base font-semibold">Hoạt động gần đây</h2>
        </div>
      </header>
      {loading && !data ? (
        <div className="space-y-4 px-5 py-2">
          <Skeleton className="w-3/4" />
          <Skeleton className="w-2/3" />
          <Skeleton className="w-1/2" />
        </div>
      ) : data && data.activity.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">Chưa có hoạt động nào</p>
      ) : (
        <ul className="flex flex-col gap-1 px-2">
          {data?.activity.map((a, i) => (
            <li key={i} className="flex gap-3 rounded-xl px-3 py-2.5">
              {a.actorType === "system" ? (
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-muted">
                  <Bot className="size-4" aria-hidden />
                </span>
              ) : (
                <Avatar name={a.actorName} />
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm text-muted [overflow-wrap:anywhere]">
                  <span className="font-medium text-foreground">{a.actorName}</span> {a.action} <span className="text-foreground">{a.target}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {PORTAL_LABEL[a.actorType]} · <time dateTime={a.createdAt}>{relativeDay(a.createdAt)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface Step {
  title: string;
  done: boolean;
  desc: string;
  action: (primary: boolean) => React.ReactNode;
}

function Onboarding({ checks, onRecheck }: { checks: HealthCheck[] | null; onRecheck: () => void }) {
  const status = (id: string) => checks?.find((c) => c.id === id)?.status;
  const recheck = (primary: boolean) => (
    <Button variant={primary ? "primary" : "outline"} icon={RefreshCw} onClick={onRecheck}>
      Kiểm tra lại
    </Button>
  );
  const steps: Step[] = [
    { title: "Kết nối Claude API", done: status("anthropic") === "connected", desc: "Đặt ANTHROPIC_API_KEY trong biến môi trường của Vercel, deploy lại rồi kiểm tra lại.", action: recheck },
    {
      title: "Mời người dùng đầu tiên",
      done: false,
      desc: "Người dùng đăng nhập ở portal DevKits riêng, không vào được trang vận hành này.",
      action: (primary) => (
        <Link
          href="/ops/accounts?invite=1"
          className={cn(
            "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium outline-hidden transition-colors",
            primary ? "bg-primary text-primary-foreground hover:bg-primary-hover" : "border border-border-strong bg-surface text-foreground hover:bg-button-hover",
          )}
        >
          <UserPlus className="size-4" aria-hidden />
          Mời người dùng
        </Link>
      ),
    },
    { title: "Kết nối Vercel để xem deployment", done: status("vercel") === "connected", desc: "Đặt VERCEL_TOKEN và VERCEL_PROJECT để trợ lý đọc được deployment và build log.", action: recheck },
    { title: "Bật endpoint MCP cho agent", done: status("database") === "connected", desc: "Agent kết nối /api/mcp bằng token cá nhân lưu trong cơ sở dữ liệu. Trên Vercel cần đặt DATABASE_URL.", action: recheck },
  ];
  const next = steps.findIndex((s) => !s.done);
  const [open, setOpen] = useState<number | null>(next);
  useEffect(() => setOpen(next), [next]);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="rounded-2xl border border-border bg-surface">
      <div className="px-4 pt-4 pb-4 sm:px-5">
        <div className="flex items-center gap-3">
          <h2 className="min-w-0 flex-1 text-sm font-medium">Các bước bắt đầu</h2>
          <span className="text-sm text-muted tabular-nums">
            {doneCount} / {steps.length} bước
          </span>
        </div>
        <div className="mt-3 h-2 rounded-full bg-foreground/5">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
      </div>
      {steps.map((s, i) => (
        <div key={s.title} className="border-t border-border">
          <button
            type="button"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left outline-hidden sm:px-5"
          >
            {s.done ? (
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" aria-hidden />
              </span>
            ) : (
              <span className="size-5 shrink-0 rounded-full border-[1.5px] border-dashed border-foreground/40" />
            )}
            <span className={cn("min-w-0 flex-1 text-sm font-medium", s.done && "text-muted")}>{s.title}</span>
            <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform duration-200 motion-reduce:transition-none", open === i && "rotate-180")} aria-hidden />
          </button>
          {open === i && (
            <div className="pr-4 pb-4 pl-[52px] sm:pr-5 sm:pl-[56px]">
              <p className="text-sm text-muted">{s.desc}</p>
              <div className="mt-4">{s.action(i === next)}</div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export function Overview() {
  const account = useAccount();
  const health = useHealth();
  const overview = useOverview();
  const reloadAll = () => {
    void health.reload();
    void overview.reload();
  };
  const empty = overview.data?.totals.users === 0;

  let body: React.ReactNode;
  if (overview.error && !overview.data) {
    body = (
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-border bg-surface">
          <LoadError title="Không tải được tổng quan" reason={overview.error} onRetry={reloadAll} />
        </div>
      </div>
    );
  } else if (empty) {
    body = (
      <div className="max-w-4xl space-y-6 p-4 sm:p-6">
        <Onboarding checks={health.checks} onRecheck={() => void health.reload()} />
      </div>
    );
  } else {
    body = (
      <div className="grid grid-cols-1 gap-3 p-4 sm:p-6 xl:grid-cols-3">
        <div className="min-w-0 space-y-3 xl:col-span-2">
          <HealthCard checks={health.checks} loading={health.loading} error={health.error} onRetry={() => void health.reload()} />
          <ActivityCard data={overview.data} loading={overview.loading} />
        </div>
        <div className="min-w-0 space-y-3">
          <UsageCard data={overview.data} loading={overview.loading} />
        </div>
      </div>
    );
  }

  return (
    <AppShell
      portal="ops"
      nav={OPS_NAV}
      activeHref="/ops"
      account={account}
      title="Tổng quan"
      actions={
        <Button icon={RefreshCw} loading={health.loading} onClick={reloadAll}>
          Kiểm tra lại
        </Button>
      }
    >
      {body}
    </AppShell>
  );
}
