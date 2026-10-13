"use client";

import { Check, ChevronDown, ChevronLeft, Ellipsis, KeyRound, Lock, LockOpen, Mail, Send, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/ui/AppShell";
import { Avatar, Badge, Button, LoadError, Skeleton, cn } from "@/components/ui/primitives";
import { useAccount } from "@/components/session-context";
import { ConfirmDialog } from "@/components/ops/Dialog";
import { InviteLinkModal, InviteModal, ROLES, type InviteResult, type Role } from "@/components/ops/InviteModal";
import { daysUntil, formatNumber, shortDate, timeAgo } from "@/components/ops/format";
import { OPS_NAV } from "@/lib/nav";
import { formatUsd } from "@/lib/pricing";

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: "invited" | "active" | "suspended";
  createdAt: string;
  lastSeenAt: string | null;
  inviteExpiresAt: string | null;
  activeTokens: number;
  tokensExpiringSoon: number;
}
interface Token {
  id: string;
  name: string;
  masked: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}
interface Detail {
  user: Omit<UserItem, "activeTokens" | "tokensExpiringSoon">;
  tokens: Token[];
  usage: { chats: number; mcpCalls: number; costMicros: number };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (res.status === 401) {
    window.location.href = "/ops/login";
    throw new Error("Phiên đăng nhập đã hết hạn.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Máy chủ trả về ${res.status}`);
  return body;
}

// ---------- List ----------

function UserRow({ u, selected, onSelect }: { u: UserItem; selected: boolean; onSelect: () => void }) {
  const invited = u.status === "invited";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-hidden", selected ? "bg-secondary" : "hover:bg-item-hover")}
    >
      {invited ? (
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full text-muted", selected ? "bg-surface" : "bg-background")}>
          <Mail className="size-4" aria-hidden />
        </span>
      ) : (
        <Avatar name={u.name || u.email} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("min-w-0 truncate text-sm", selected && "font-medium")} title={invited ? u.email : u.name}>
            {invited ? u.email : u.name || u.email}
          </span>
          {u.status === "suspended" && <Badge>Tạm khoá</Badge>}
          {invited && <Badge>Chờ</Badge>}
        </span>
        <span className={cn("block truncate text-xs", selected ? "text-foreground/70" : "text-muted")}>
          {invited ? `Đã mời ${shortDate(u.createdAt)}` : u.email}
        </span>
      </span>
    </button>
  );
}

// ---------- Detail pieces ----------

function RoleMenu({ role, onChange, busy }: { role: Role; onChange: (r: Role) => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const current = ROLES.find((r) => r.value === role)!;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Vai trò: ${current.label}`}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className="inline-grid h-10 grid-cols-[1fr_auto] items-center gap-1.5 rounded-xl border border-border-strong bg-surface px-3 text-sm outline-hidden aria-expanded:border-focus aria-expanded:ring-2 aria-expanded:ring-focus disabled:opacity-50"
      >
        <span className="grid">
          {ROLES.map((r) => (
            <span key={r.value} className={cn("col-start-1 row-start-1 text-left", r.value !== role && "invisible")} aria-hidden={r.value !== role}>
              {r.label}
            </span>
          ))}
        </span>
        <ChevronDown className={cn("size-3.5 text-muted transition-transform duration-200", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul role="listbox" aria-label="Vai trò" className="menu-pop absolute right-0 z-30 mt-2 origin-top-right flex w-72 flex-col gap-1 rounded-2xl border border-border bg-surface-overlay p-1 shadow-popover">
          {ROLES.map((r) => (
            <li key={r.value} role="option" aria-selected={r.value === role}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (r.value !== role) onChange(r.value);
                }}
                className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left outline-hidden hover:bg-item-hover"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">{r.label}</span>
                  <span className="block text-xs text-muted">{r.desc}</span>
                </span>
                {r.value === role && <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TokenRow({ token, onRevoke }: { token: Token; onRevoke: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const left = token.expiresAt ? daysUntil(token.expiresAt) : null;
  const soon = left !== null && left <= 7;
  const expiry = !token.expiresAt ? "Không hết hạn" : soon ? `Hết hạn sau ${Math.max(left!, 0)} ngày` : `Hết hạn ${shortDate(token.expiresAt)}`;
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={token.name}>
          {token.name}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          <span className="block sm:inline">
            <span className="font-mono">{token.masked}</span> · {token.lastUsedAt ? `Dùng ${timeAgo(token.lastUsedAt)}` : "Chưa dùng lần nào"}
          </span>
          <span aria-hidden className="hidden sm:inline">
            {" "}
            ·{" "}
          </span>
          <span className={cn("block sm:inline", soon && "text-amber-700 dark:text-orange-400")}>{expiry}</span>
        </p>
      </div>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-label={`Thao tác cho ${token.name}`}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted outline-hidden hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/5"
        >
          <Ellipsis className="size-4" aria-hidden />
        </button>
        {open && (
          <div role="menu" className="menu-pop absolute right-0 z-30 mt-2 w-48 origin-top-right rounded-2xl border border-border bg-surface-overlay p-1 shadow-popover">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onRevoke();
              }}
              className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm outline-hidden hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-400"
            >
              <KeyRound className="size-4" aria-hidden />
              Thu hồi token
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

function UserDetail({ id, onChanged, onInviteLink }: { id: string; onChanged: () => void; onInviteLink: (r: InviteResult) => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "suspend" } | { kind: "revoke"; token: Token } | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDetail(await api<Detail>(`/api/ops/users/${id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi mạng");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    setDetail(null);
    setNotice(null);
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  async function patch(body: object, message: string) {
    setBusy(true);
    try {
      const { user } = await api<{ user: Detail["user"] }>(`/api/ops/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setDetail((d) => (d ? { ...d, user } : d));
      setNotice(message);
      onChanged();
      return true;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Không lưu được thay đổi.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!confirm || !detail) return;
    setBusy(true);
    setConfirmError(null);
    try {
      if (confirm.kind === "suspend") {
        const { user } = await api<{ user: Detail["user"] }>(`/api/ops/users/${id}`, { method: "PATCH", body: JSON.stringify({ status: "suspended" }) });
        setDetail((d) => (d ? { ...d, user } : d));
        setNotice("Đã tạm khoá tài khoản. Phiên đăng nhập và token của người này ngừng hoạt động.");
      } else {
        await api(`/api/ops/users/${id}/tokens/${confirm.token.id}`, { method: "DELETE" });
        setDetail((d) => (d ? { ...d, tokens: d.tokens.filter((t) => t.id !== confirm.token.id) } : d));
        setNotice(`Đã thu hồi token ${confirm.token.name}.`);
      }
      setConfirm(null);
      onChanged();
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : "Không thực hiện được. Thử lại.");
    } finally {
      setBusy(false);
    }
  }

  async function resendInvite() {
    if (!detail) return;
    setBusy(true);
    try {
      const body = await api<{ user: { email: string }; inviteUrl: string; expiresInDays: number }>("/api/ops/users", {
        method: "POST",
        body: JSON.stringify({ email: detail.user.email, role: detail.user.role }),
      });
      onInviteLink({ email: body.user.email, inviteUrl: body.inviteUrl, expiresInDays: body.expiresInDays });
      void load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Không tạo được lời mời mới.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !detail) {
    return (
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="w-1/2" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !detail) {
    return (
      <div className="rounded-2xl border border-border bg-surface">
        <LoadError title="Không tải được người dùng" reason={error ?? undefined} onRetry={() => void load()} />
      </div>
    );
  }

  const { user, tokens, usage } = detail;
  const invited = user.status === "invited";
  const label = user.name || user.email;

  return (
    <div className="space-y-3">
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {invited ? (
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-background text-muted">
                <Mail className="size-5" aria-hidden />
              </span>
            ) : (
              <Avatar name={label} className="size-12 text-sm" />
            )}
            <div className="min-w-0">
              <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
                <span className="truncate" title={label}>
                  {invited ? user.email : label}
                </span>
                {user.status === "suspended" && <Badge>Tạm khoá</Badge>}
              </h2>
              <p className="truncate text-sm text-muted">
                {invited
                  ? `Đã mời ${shortDate(user.createdAt)}${user.inviteExpiresAt ? ` · lời mời hết hạn ${shortDate(user.inviteExpiresAt)}` : ""}`
                  : `${user.email} · tham gia ${shortDate(user.createdAt)}`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <RoleMenu role={user.role} busy={busy} onChange={(r) => void patch({ role: r }, `Đã đổi vai trò thành ${ROLES.find((x) => x.value === r)!.label}.`)} />
            {invited ? (
              <Button icon={Send} loading={busy} onClick={() => void resendInvite()}>
                Gửi lại lời mời
              </Button>
            ) : user.status === "suspended" ? (
              <Button icon={LockOpen} loading={busy} onClick={() => void patch({ status: "active" }, "Đã mở khoá tài khoản.")}>
                Mở khoá
              </Button>
            ) : (
              <Button
                variant="danger"
                icon={Lock}
                onClick={() => {
                  setConfirmError(null);
                  setConfirm({ kind: "suspend" });
                }}
              >
                Tạm khoá
              </Button>
            )}
          </div>
        </div>
        <p role="status" className={cn("text-sm text-muted", notice && "mt-4")}>
          {notice}
        </p>
      </section>

      {invited ? (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm text-muted">Người này chưa nhận lời mời. Token MCP và mức sử dụng hiện ra sau khi họ kích hoạt tài khoản.</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-surface">
            <header className="flex items-center justify-between gap-3 px-5 py-4">
              <h2 className="text-base font-semibold">Token MCP</h2>
              <span className="text-sm text-muted">{tokens.length} đang hiệu lực</span>
            </header>
            {tokens.length === 0 ? (
              <p className="border-t border-border px-5 py-6 text-center text-sm text-muted">Chưa có token nào</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {tokens.map((t) => (
                  <TokenRow
                    key={t.id}
                    token={t}
                    onRevoke={() => {
                      setConfirmError(null);
                      setConfirm({ kind: "revoke", token: t });
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-base font-semibold">Sử dụng 7 ngày</h2>
            <dl className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
              {(
                [
                  ["Cuộc trò chuyện", formatNumber(usage.chats)],
                  ["Lượt gọi MCP", formatNumber(usage.mcpCalls)],
                  ["Chi phí Claude", formatUsd(usage.costMicros)],
                ] as const
              ).map(([l, n]) => (
                <div key={l} className="rounded-xl bg-background px-4 py-3">
                  <dt className="text-xs text-muted">{l}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}

      <ConfirmDialog
        open={confirm?.kind === "suspend"}
        icon={Lock}
        title="Tạm khoá tài khoản?"
        confirmLabel="Tạm khoá tài khoản"
        busy={busy}
        error={confirmError}
        onConfirm={() => void runConfirm()}
        onClose={() => setConfirm(null)}
      >
        <span className="font-medium text-foreground [overflow-wrap:anywhere]">{label}</span> bị đăng xuất ngay, mọi token MCP của họ ngừng hoạt động cho tới khi bạn mở khoá.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "revoke"}
        icon={KeyRound}
        title="Thu hồi token?"
        confirmLabel="Thu hồi token"
        busy={busy}
        error={confirmError}
        onConfirm={() => void runConfirm()}
        onClose={() => setConfirm(null)}
      >
        <span className="font-medium text-foreground [overflow-wrap:anywhere]">{confirm?.kind === "revoke" ? confirm.token.name : ""}</span> ngừng hoạt động ngay. Agent đang dùng token này sẽ báo lỗi
        401 và không gọi lại được.
      </ConfirmDialog>
    </div>
  );
}

// ---------- Page ----------

export function Accounts() {
  const account = useAccount();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selectedParam = params.get("id");

  const [users, setUsers] = useState<UserItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(params.get("invite") === "1");
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers((await api<{ users: UserItem[] }>("/api/ops/users")).users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi mạng");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const select = useCallback(
    (id: string | null) => router.replace(id ? `${pathname}?id=${encodeURIComponent(id)}` : pathname, { scroll: false }),
    [router, pathname],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!users || !q) return users;
    return users.filter((u) => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q));
  }, [users, query]);

  // Desktop shows the first user when nothing is selected; mobile keeps the list.
  const selectedId = selectedParam ?? users?.[0]?.id ?? null;

  let list: React.ReactNode;
  if (loading && !users) {
    list = Array.from({ length: 6 }, (_, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
        <div className="size-8 animate-pulse rounded-full bg-foreground/5" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-1/2" />
          <Skeleton className="w-2/3" />
        </div>
      </div>
    ));
  } else if (error && !users) {
    list = <LoadError title="Không tải được người dùng" reason={error} onRetry={() => void load()} />;
  } else if (users && users.length === 0) {
    list = <p className="px-3 py-6 text-center text-sm text-muted">Chưa có người dùng nào</p>;
  } else if (filtered && filtered.length === 0) {
    list = (
      <p className="px-3 py-6 text-center text-sm text-muted">
        Không có ai khớp “{query.length > 24 ? `${query.slice(0, 24)}…` : query}”.{" "}
        <button type="button" onClick={() => setQuery("")} className="font-medium text-foreground underline-offset-4 hover:underline">
          Xoá tìm kiếm
        </button>
      </p>
    );
  } else {
    list = (
      <div className="flex flex-col gap-1">
        {filtered?.map((u) => (
          <UserRow key={u.id} u={u} selected={u.id === selectedId} onSelect={() => select(u.id)} />
        ))}
      </div>
    );
  }

  let detail: React.ReactNode = null;
  if (users && users.length === 0) {
    detail = (
      <div className="rounded-2xl border border-border bg-surface p-6">
        <p className="text-sm text-muted">Mời người đầu tiên bằng nút Mời người dùng. Họ đăng nhập ở portal DevKits, không thấy trang vận hành.</p>
      </div>
    );
  } else if (selectedId) {
    detail = <UserDetail key={selectedId} id={selectedId} onChanged={() => void load()} onInviteLink={setInviteResult} />;
  } else if (loading) {
    detail = (
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-6">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="w-1/2" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <AppShell
      portal="ops"
      nav={OPS_NAV.map((n) => (n.href === "/ops/accounts" && users ? { ...n, count: users.length } : n))}
      activeHref="/ops/accounts"
      account={account}
      title="Tài khoản"
      actions={
        <Button variant="primary" icon={UserPlus} onClick={() => setInviteOpen(true)}>
          Mời người dùng
        </Button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className={cn("w-full shrink-0 border-border bg-surface lg:block lg:w-80 lg:border-r", selectedParam ? "hidden" : "block")}>
          <div className="h-full overflow-y-auto p-3">
            <label className="mb-3 block px-1">
              <span className="sr-only">Tìm người dùng</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên, email"
                className="h-11 w-full rounded-xl border border-border-strong bg-surface px-4 text-base outline-hidden placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus md:h-10 md:text-sm"
              />
            </label>
            {list}
          </div>
        </aside>
        <main className={cn("min-w-0 flex-1 p-4 sm:p-6 lg:block", selectedParam ? "block" : "hidden")}>
          <Link href={pathname} scroll={false} className="mb-4 inline-flex h-8 items-center gap-1 text-sm text-muted hover:text-foreground lg:hidden">
            <ChevronLeft className="size-4" aria-hidden />
            Tất cả người dùng
          </Link>
          <div className="max-w-3xl">{detail}</div>
        </main>
      </div>

      <InviteModal
        open={inviteOpen}
        onClose={() => {
          setInviteOpen(false);
          if (params.get("invite")) select(selectedParam);
        }}
        onInvited={(r) => {
          setInviteOpen(false);
          setInviteResult(r);
          void load();
        }}
      />
      <InviteLinkModal result={inviteResult} onClose={() => setInviteResult(null)} />
    </AppShell>
  );
}
