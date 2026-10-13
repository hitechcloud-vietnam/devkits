"use client";

import { ChevronLeft, ExternalLink, KeyRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAccount } from "@/components/session-context";
import { AppShell } from "@/components/ui/AppShell";
import { Button, CodeBlock, LetterSquare, LoadError, Skeleton, cn } from "@/components/ui/primitives";
import { GROUP_LABELS, PLATFORMS, shortName, type Platform } from "@/components/user/platforms";
import { CreateTokenDialog, TokenList, useTokens, type TokensApi } from "@/components/user/tokens";
import { USER_NAV } from "@/lib/nav";

const SKILL_COUNT = 9;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-medium tabular-nums">{n}</span>
      <div className="min-w-0 flex-1 space-y-3 pb-1">
        <h3 className="pt-0.5 text-sm font-semibold">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function TokenStep({ platform, api, readonly, onCreate }: { platform: Platform; api: TokensApi; readonly: boolean; onCreate: () => void }) {
  const { state } = api;
  if (readonly) return <p className="text-sm text-muted">Tài khoản chỉ đọc không tạo được token. Nhờ người vận hành đổi vai trò để kết nối agent.</p>;
  if (state.status === "loading")
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="w-2/3" />
        <Skeleton className="w-1/3" />
      </div>
    );
  if (state.status === "error") return <LoadError title="Không tải được token của bạn" reason={state.message} onRetry={api.reload} />;
  const count = state.tokens.length;
  return (
    <>
      <p className="text-sm text-muted">
        {count === 0
          ? "Bạn chưa có token nào. Token chỉ hiện đầy đủ một lần lúc tạo; dán ngay vào agent ở bước 2."
          : `Bạn có ${count} token đang hiệu lực. Nên tạo một token riêng cho ${platform.name} để thu hồi riêng được.`}
      </p>
      <Button icon={KeyRound} variant={count === 0 ? "primary" : "outline"} onClick={onCreate}>
        Tạo token cho {platform.name}
      </Button>
    </>
  );
}

function PlatformDetail({ platform, api, readonly, onCreate }: { platform: Platform; api: TokensApi; readonly: boolean; onCreate: () => void }) {
  const hasInstall = platform.install.length > 0;
  const [tab, setTab] = useState<"install" | "mcp">(hasInstall ? "install" : "mcp");
  useEffect(() => setTab(platform.install.length > 0 ? "install" : "mcp"), [platform]);
  const tabs: { id: "install" | "mcp"; label: string }[] = [
    ...(hasInstall ? [{ id: "install" as const, label: "Cài đặt" }] : []),
    ...(platform.mcpOnly ? [{ id: "mcp" as const, label: hasInstall ? "Chỉ MCP" : "Cấu hình MCP" }] : []),
  ];
  const steps = tab === "install" ? platform.install : platform.mcpOnly ? [platform.mcpOnly] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <LetterSquare seed={platform.name} label={shortName(platform)} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{platform.name}</h2>
          <p className="text-sm text-muted">
            {platform.package}
            {platform.group === "plugin" ? ` · Gồm MCP DevKits và ${SKILL_COUNT} skill` : ""}
          </p>
        </div>
      </div>

      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-tab-rail" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "-mb-px h-10 border-b-2 px-3 text-sm outline-hidden",
                tab === t.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <ol className="space-y-6">
        <Step n={1} title={`Có token cho ${platform.name}`}>
          <TokenStep platform={platform} api={api} readonly={readonly} onCreate={onCreate} />
        </Step>
        <Step n={2} title={tab === "install" ? "Cài vào agent" : "Thêm cấu hình MCP"}>
          {steps.map((s, i) => (
            <div key={i} className="space-y-2">
              <p className="text-sm text-muted">{s.label}:</p>
              <CodeBlock code={s.code} copyLabel="Chép lệnh" />
            </div>
          ))}
        </Step>
        <Step n={3} title="Kiểm tra">
          <p className="text-sm text-muted">
            Trong agent, liệt kê công cụ MCP: thấy <span className="font-mono text-foreground">devkits</span> với các công cụ chỉ đọc là xong. Lỗi 401 là thiếu hoặc sai token.
          </p>
          {platform.notes.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-pretty text-muted marker:text-muted">
              {platform.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          {!platform.verified && <p className="text-sm text-amber-700 dark:text-orange-400">Cấu hình cho nền tảng này chưa được đối chiếu đầy đủ với tài liệu chính thức.</p>}
          <a href={platform.docs} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 outline-hidden hover:underline">
            Tài liệu của {platform.name}
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </Step>
      </ol>
    </div>
  );
}

function TokenPanel({ open, onClose, api, readonly, onCreate }: { open: boolean; onClose: () => void; api: TokensApi; readonly: boolean; onCreate: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <div className={open ? "fixed inset-0 z-40 overflow-hidden" : "pointer-events-none fixed inset-0 z-40 overflow-hidden"}>
      <div className="scrim pointer-events-none absolute inset-0 bg-black/15 opacity-0" data-open={open || undefined} onClick={onClose} />
      <aside
        className="drawer absolute inset-y-0 right-0 flex w-full max-w-lg translate-x-full flex-col bg-surface shadow-modal dark:border-l dark:border-border"
        data-open={open || undefined}
        inert={!open}
        aria-label="Quản lý token"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border pr-3 pl-6">
          <p className="text-base font-semibold">Quản lý token</p>
          <button type="button" aria-label="Đóng" onClick={onClose} className="inline-flex size-10 items-center justify-center rounded-xl text-muted outline-hidden hover:bg-foreground/5 hover:text-foreground">
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-background p-4 sm:p-6">
          <TokenList api={api} readonly={readonly} onCreate={onCreate} />
        </div>
      </aside>
    </div>
  );
}

export default function AgentConnect() {
  const account = useAccount();
  const readonly = account.role === "readonly";
  const api = useTokens();
  const [selectedId, setSelectedId] = useState(PLATFORMS[0].id);
  const [query, setQuery] = useState("");
  const [mobileDetail, setMobileDetail] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [createFor, setCreateFor] = useState<string | null>(null);

  const selected = PLATFORMS.find((p) => p.id === selectedId) ?? PLATFORMS[0];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PLATFORMS.filter((p) => `${p.name} ${p.package}`.toLowerCase().includes(q)) : PLATFORMS;
  }, [query]);

  const list = (
    <div className="p-3">
      <label className="mb-3 block px-1">
        <span className="sr-only">Tìm agent</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm agent"
          className="h-11 w-full rounded-xl border border-border-strong bg-surface px-4 text-base outline-hidden placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus md:h-10 md:text-sm"
        />
      </label>
      {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Không có agent nào khớp &quot;{query.trim().slice(0, 24)}&quot;. Thử từ khoá khác.</p>}
      {(Object.keys(GROUP_LABELS) as Platform["group"][]).map((g) => {
        const items = filtered.filter((p) => p.group === g);
        if (!items.length) return null;
        return (
          <section key={g} className="mt-4 first:mt-0">
            <h3 className="flex h-8 items-center px-3 text-xs font-medium tracking-wide text-muted uppercase">{GROUP_LABELS[g]}</h3>
            <div className="flex flex-col gap-1">
              {items.map((p) => {
                const on = p.id === selected.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => {
                      setSelectedId(p.id);
                      setMobileDetail(true);
                      window.scrollTo({ top: 0 });
                    }}
                    className={cn("flex items-center gap-3 rounded-xl px-2 py-2 text-left outline-hidden", on ? "bg-secondary" : "hover:bg-item-hover")}
                  >
                    <LetterSquare seed={p.name} label={shortName(p)} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm", on && "font-medium")}>{p.name}</span>
                      <span className={cn("block truncate text-xs", on ? "text-foreground/70" : "text-muted")}>{p.package}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <AppShell
      portal="user"
      nav={USER_NAV}
      activeHref="/agent"
      account={account}
      title="Kết nối agent"
      actions={
        <Button icon={KeyRound} onClick={() => setPanelOpen(true)}>
          <span className="hidden sm:inline">Quản lý token</span>
          <span className="sm:hidden">Token</span>
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className={cn("w-full shrink-0 border-border bg-surface lg:block lg:w-80 lg:border-r", mobileDetail ? "hidden" : "block")}>
          <div>{list}</div>
        </aside>
        <main className={cn("min-w-0 flex-1 p-4 sm:p-6 lg:block", mobileDetail ? "block" : "hidden")}>
          <button type="button" onClick={() => setMobileDetail(false)} className="mb-4 inline-flex h-8 items-center gap-1 text-sm text-muted hover:text-foreground lg:hidden">
            <ChevronLeft className="size-4" aria-hidden />
            Tất cả agent
          </button>
          <div className="max-w-3xl rounded-2xl border border-border bg-surface p-5 sm:p-6">
            <PlatformDetail platform={selected} api={api} readonly={readonly} onCreate={() => setCreateFor(selected.name)} />
          </div>
        </main>
      </div>
      <TokenPanel open={panelOpen} onClose={() => setPanelOpen(false)} api={api} readonly={readonly} onCreate={() => setCreateFor("")} />
      <CreateTokenDialog open={createFor !== null} onClose={() => setCreateFor(null)} api={api} defaultName={createFor ?? ""} />
    </AppShell>
  );
}
