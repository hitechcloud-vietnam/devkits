"use client";

import { Check, Copy, Ellipsis, KeyRound, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, LoadError, Skeleton, cn, inputClass } from "@/components/ui/primitives";
import { expiryLabel, relativeTime } from "@/components/user/format";
import { Modal } from "@/components/user/Modal";

export interface McpToken {
  id: string;
  name: string;
  masked: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; tokens: McpToken[] };

/** The signed-in user's MCP tokens, with create and revoke against /api/me/tokens. */
export function useTokens() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const reload = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/me/tokens", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`Máy chủ trả lỗi ${res.status}`);
      setState({ status: "ready", tokens: ((await res.json()) as { tokens: McpToken[] }).tokens });
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Không kết nối được máy chủ" });
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (name: string, expiresInDays: number | null) => {
    const res = await fetch("/api/me/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, expiresInDays }),
    });
    const body = (await res.json().catch(() => ({}))) as { token?: McpToken; secret?: string; error?: string; code?: string };
    if (!res.ok || !body.token || !body.secret) return { ok: false as const, error: body.error ?? "Không tạo được token.", code: body.code };
    setState((s) => (s.status === "ready" ? { status: "ready", tokens: [body.token!, ...s.tokens] } : s));
    return { ok: true as const, token: body.token, secret: body.secret };
  }, []);

  const revoke = useCallback(async (id: string) => {
    const res = await fetch(`/api/me/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false as const, error: body.error ?? "Không thu hồi được token." };
    }
    setState((s) => (s.status === "ready" ? { status: "ready", tokens: s.tokens.filter((t) => t.id !== id) } : s));
    return { ok: true as const };
  }, []);

  return { state, reload, create, revoke };
}

export type TokensApi = ReturnType<typeof useTokens>;

const EXPIRY_OPTIONS: { days: number | null; label: string }[] = [
  { days: 30, label: "30 ngày" },
  { days: 90, label: "90 ngày" },
  { days: 365, label: "1 năm" },
  { days: null, label: "Không hết hạn" },
];

function expiryHint(days: number | null): string {
  if (days === null) return "Token dùng tới khi bạn thu hồi.";
  const d = new Date(Date.now() + days * 86_400_000);
  return `Hết hạn ngày ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}.`;
}

/** Create-token dialog: form step, then the one-time reveal step in the same dialog. */
export function CreateTokenDialog({ open, onClose, api, defaultName }: { open: boolean; onClose: () => void; api: TokensApi; defaultName?: string }) {
  const [name, setName] = useState(defaultName ?? "");
  const [days, setDays] = useState<number | null>(90);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setName(defaultName ?? "");
      setDays(90);
      setError(null);
      setSecret(null);
      setCopied(false);
    }
  }, [open, defaultName]);

  useEffect(() => {
    if (secret) copyRef.current?.focus();
  }, [secret]);

  async function submit() {
    if (!name.trim()) {
      setError("Nhập tên token.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await api.create(name.trim(), days);
    setBusy(false);
    if (!result.ok) setError(result.code === "duplicate_name" ? "Bạn đã có token với tên này. Đặt tên khác để sau này biết token nào thu hồi được." : result.error);
    else setSecret(result.secret);
  }

  if (secret) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Sao chép token"
        description="Đây là lần duy nhất bạn thấy token đầy đủ. Dán vào agent ngay, hoặc cất vào trình quản lý mật khẩu."
        footer={
          <Button variant="secondary" onClick={onClose}>
            Xong
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="rounded-xl bg-background px-4 py-3 font-mono text-[13px] break-all select-all">{secret}</p>
          <button
            ref={copyRef}
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                /* select-all on the block lets the user copy manually */
              }
            }}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground outline-hidden hover:bg-primary-hover"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            Sao chép token
          </button>
          <span className="sr-only" role="status">
            {copied ? "Đã sao chép" : ""}
          </span>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      title="Tạo token MCP"
      description="Agent dùng token này để gọi DevKits. Mỗi máy hoặc agent một token, để thu hồi riêng được."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy} className="min-h-11 md:min-h-10">
            Huỷ
          </Button>
          <Button variant="primary" loading={busy} onClick={submit} className="min-h-11 md:min-h-10">
            Tạo token
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div>
          <label htmlFor="token-name" className="mb-1.5 block text-sm font-medium">
            Tên token
          </label>
          <input
            id="token-name"
            data-autofocus
            className={inputClass}
            value={name}
            maxLength={80}
            aria-invalid={error ? true : undefined}
            aria-describedby="token-name-hint"
            onChange={(e) => setName(e.target.value)}
            placeholder="Claude Code · MacBook của tôi"
          />
          {error ? (
            <p id="token-name-hint" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : (
            <p id="token-name-hint" className="mt-1.5 text-sm text-muted">
              Đặt theo nơi dùng token, để sau này biết token nào thu hồi được.
            </p>
          )}
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Hạn dùng</legend>
          <div className="grid grid-cols-2 gap-2">
            {EXPIRY_OPTIONS.map((o) => {
              const on = o.days === days;
              return (
                <label
                  key={o.label}
                  className={cn(
                    "flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 text-sm md:h-10",
                    on ? "border-focus ring-2 ring-focus" : "border-border-strong hover:bg-button-hover",
                  )}
                >
                  <input type="radio" name="expiry" className="sr-only" checked={on} onChange={() => setDays(o.days)} />
                  <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border", on ? "border-primary bg-primary" : "border-border-strong bg-surface")}>{on && <span className="size-1.5 rounded-full bg-primary-foreground" />}</span>
                  {o.label}
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 text-sm text-muted">{expiryHint(days)}</p>
        </fieldset>
      </form>
    </Modal>
  );
}

export function RevokeTokenDialog({ token, onClose, api }: { token: McpToken | null; onClose: () => void; api: TokensApi }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [token]);
  return (
    <Modal
      open={Boolean(token)}
      onClose={onClose}
      busy={busy}
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400">
            <KeyRound className="size-4" aria-hidden />
          </span>
          Thu hồi token?
        </span>
      }
      description={
        <>
          <span className="font-medium text-foreground">{token?.name}</span> sẽ ngừng hoạt động ngay. Agent đang dùng token này sẽ không gọi được DevKits nữa.
        </>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy} className="min-h-11 md:min-h-10">
            Huỷ
          </Button>
          <Button
            variant="danger"
            loading={busy}
            className="min-h-11 md:min-h-10"
            onClick={async () => {
              if (!token) return;
              setBusy(true);
              const r = await api.revoke(token.id);
              setBusy(false);
              if (r.ok) onClose();
              else setError(r.error);
            }}
          >
            Thu hồi token
          </Button>
        </>
      }
    >
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </Modal>
  );
}

function TokenRow({ token, onRevoke }: { token: McpToken; onRevoke: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menu]);
  const used = relativeTime(token.lastUsedAt);
  const exp = expiryLabel(token.expiresAt);
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={token.name}>
          {token.name}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          <span className="block sm:inline">
            <span className="font-mono">{token.masked}</span> · {used ? `Dùng ${used}` : "Chưa dùng lần nào"}
          </span>
          <span aria-hidden className="hidden sm:inline">
            {" "}
            ·{" "}
          </span>
          <span className={cn("block sm:inline", exp.soon && "text-amber-700 dark:text-orange-400")}>{exp.text}</span>
        </p>
      </div>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-label={`Thao tác cho ${token.name}`}
          aria-haspopup="menu"
          aria-expanded={menu}
          onClick={() => setMenu((v) => !v)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted outline-hidden hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/5"
        >
          <Ellipsis className="size-4" aria-hidden />
        </button>
        {menu && (
          <div role="menu" className="menu-pop absolute right-0 z-20 mt-1 w-48 origin-top-right rounded-2xl border border-border bg-surface-overlay p-1 shadow-popover">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                onRevoke();
              }}
              className="flex h-10 w-full items-center rounded-xl px-3 text-left text-sm text-foreground outline-hidden hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-400"
            >
              Thu hồi token
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** "Token MCP của bạn" card body: list with states and the create action. */
export function TokenList({ api, readonly, onCreate }: { api: TokensApi; readonly: boolean; onCreate: () => void }) {
  const [revoking, setRevoking] = useState<McpToken | null>(null);
  const { state } = api;
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <header className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Token MCP của bạn</h2>
          <p className="mt-1 max-w-[55ch] text-sm text-muted">Agent dùng token để gọi DevKits. Giữ như mật khẩu; mất máy thì thu hồi token của máy đó.</p>
        </div>
        {!readonly && (
          <Button icon={Plus} variant={state.status === "ready" && state.tokens.length === 0 ? "primary" : "outline"} onClick={onCreate}>
            Tạo token
          </Button>
        )}
      </header>
      {readonly && <p className="border-t border-border px-5 py-4 text-sm text-muted">Tài khoản của bạn ở chế độ chỉ đọc nên không tạo được token. Nhờ người vận hành đổi vai trò nếu cần kết nối agent.</p>}
      {state.status === "loading" && (
        <ul aria-busy="true" className="divide-y divide-border border-t border-border">
          {[0, 1].map((i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="flex-1 space-y-2">
                <Skeleton className="w-1/3" />
                <Skeleton className="w-1/2" />
              </div>
              <div className="size-10 animate-pulse rounded-xl bg-foreground/5 motion-reduce:animate-none" />
            </li>
          ))}
          <span className="sr-only" role="status">
            Đang tải token
          </span>
        </ul>
      )}
      {state.status === "error" && (
        <div className="border-t border-border">
          <LoadError title="Không tải được danh sách token" reason={state.message} onRetry={api.reload} />
        </div>
      )}
      {state.status === "ready" && !readonly && state.tokens.length === 0 && (
        <p className="border-t border-border px-5 py-6 text-center text-sm text-muted">Chưa có token nào. Mỗi agent nên có một token riêng để thu hồi được khi cần.</p>
      )}
      {state.status === "ready" && state.tokens.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {state.tokens.map((t) => (
            <TokenRow key={t.id} token={t} onRevoke={() => setRevoking(t)} />
          ))}
        </ul>
      )}
      <RevokeTokenDialog token={revoking} onClose={() => setRevoking(null)} api={api} />
    </section>
  );
}
