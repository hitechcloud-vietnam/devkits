"use client";

import { ChevronsUpDown, LogOut, Menu, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Avatar, cn } from "@/components/ui/primitives";

// App frame from the approved wireframe: white sidebar (w-60) beside a grey content area,
// one hairline under the h-16 header running across both, slide-over sidebar under lg.

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export interface AppShellProps {
  portal: "user" | "ops";
  nav: NavItem[];
  activeHref: string;
  account: { name: string; email: string };
  title: string;
  actions?: ReactNode;
  /** Extra sidebar content under the nav (user portal: new-chat button, recent conversations). */
  sidebarTop?: ReactNode;
  sidebarBottom?: ReactNode;
  /** Fixed-height layout (chat): the content area scrolls internally. */
  fixed?: boolean;
  children: ReactNode;
}

function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm text-foreground/70 outline-hidden transition-colors",
        active ? "bg-secondary font-medium text-foreground" : "hover:bg-item-hover hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count != null && <span className={cn("shrink-0 text-xs tabular-nums", active ? "text-foreground" : "text-muted")}>{item.count}</span>}
    </Link>
  );
}

function AccountMenu({ portal, account }: { portal: AppShellProps["portal"]; account: AppShellProps["account"] }) {
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

  async function logout() {
    await fetch(portal === "ops" ? "/api/ops/auth/logout" : "/api/auth/logout", { method: "POST" });
    window.location.href = portal === "ops" ? "/ops/login" : "/login";
  }

  const [local, domain] = account.email.split("@");
  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="menu-pop absolute bottom-full left-0 z-30 mb-2 w-full origin-bottom rounded-2xl border border-border bg-surface-overlay p-1 shadow-popover">
          <p className="flex min-w-0 px-3 py-2 text-xs text-muted" title={account.email}>
            <span className="min-w-0 truncate">{local}</span>
            <span className="shrink-0">@{domain}</span>
          </p>
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-sm text-foreground outline-hidden hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-400"
          >
            <LogOut className="size-4" aria-hidden />
            Đăng xuất
          </button>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center gap-2.5 rounded-xl px-1 text-left outline-hidden hover:bg-item-hover"
      >
        <Avatar name={account.name || account.email} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{account.name || account.email}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
    </div>
  );
}

function SidebarContent(props: AppShellProps & { onNavigate?: () => void }) {
  const { portal, nav, activeHref, account, sidebarTop, sidebarBottom, onNavigate } = props;
  return (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/hitechcloud.svg" alt="HiTechCloud" className="h-7 w-auto shrink-0" />
        <span className="h-5 w-px shrink-0 bg-border-strong" />
        <span className="truncate text-sm font-semibold">{portal === "user" ? "DevKits" : "Vận hành"}</span>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3" aria-label="Điều hướng">
        {sidebarTop}
        <div className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} active={item.href === activeHref} onNavigate={onNavigate} />
          ))}
        </div>
        {sidebarBottom}
      </nav>
      <div className="shrink-0 px-3 pb-3">
        <AccountMenu portal={portal} account={account} />
      </div>
    </>
  );
}

export function AppShell(props: AppShellProps) {
  const { title, actions, fixed, children } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div className={cn("flex", fixed ? "h-dvh" : "min-h-dvh")}>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-surface lg:flex">
        <SidebarContent {...props} />
      </aside>
      <div className="scrim pointer-events-none fixed inset-0 z-40 bg-black/15 opacity-0 lg:hidden" data-open={drawerOpen || undefined} onClick={() => setDrawerOpen(false)} />
      <aside
        className="drawer fixed inset-y-0 left-0 z-50 flex w-[min(280px,85vw)] -translate-x-full flex-col bg-surface shadow-modal lg:hidden dark:border-r dark:border-border"
        data-open={drawerOpen || undefined}
        aria-label="Menu"
        inert={!drawerOpen}
      >
        <button type="button" className="sr-only" onClick={() => setDrawerOpen(false)}>
          Đóng menu
        </button>
        <SidebarContent {...props} onNavigate={() => setDrawerOpen(false)} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Mở menu"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground/70 outline-hidden hover:bg-foreground/5 lg:hidden"
            >
              <Menu className="size-4" aria-hidden />
            </button>
            <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
