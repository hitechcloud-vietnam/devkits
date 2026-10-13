"use client";

import { Check, Copy, RotateCw, type LucideIcon } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";

// Shared primitives, class strings copied from the approved wireframe (evon ui-ux).
// Four button variants only (I1); danger is the rose-tinted variant for destructive actions.

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "outline" | "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  outline: "border border-border-strong bg-surface text-foreground hover:bg-button-hover",
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  secondary: "bg-secondary text-foreground hover:bg-secondary-hover",
  ghost: "bg-transparent text-muted hover:bg-foreground/5 hover:text-foreground",
  danger: "bg-rose-500/10 text-rose-700 hover:bg-rose-500/15 dark:text-rose-400",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({ variant = "outline", icon: Icon, loading, className, children, onClick, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      onClick={(e) => {
        if (loading) e.preventDefault();
        else onClick?.(e);
      }}
      className={cn(
        "inline-flex min-h-10 max-w-full shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2 text-center text-sm leading-tight font-medium outline-hidden transition-colors [overflow-wrap:anywhere]",
        "disabled:cursor-not-allowed disabled:not-aria-busy:opacity-50 aria-busy:cursor-progress",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <RotateCw className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden /> : Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted outline-hidden transition-colors hover:bg-foreground/5 hover:text-foreground",
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}

type BadgeTone = "neutral" | "warn" | "ok" | "err" | "info";
const BADGE: Record<BadgeTone, string> = {
  neutral: "bg-zinc-100 text-zinc-600 dark:bg-zinc-500/15 dark:text-zinc-400",
  warn: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-orange-400",
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  err: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  info: "bg-primary-light text-primary",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={cn("inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", BADGE[tone])}>{children}</span>;
}

const TONES = [
  "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
  "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
  "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-500/30",
  "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-orange-400 dark:ring-amber-500/30",
  "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
];

/** Same person or product → same colour everywhere (avatar.md). */
export function toneFor(seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return TONES[Math.abs(h) % TONES.length];
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts.length > 1 ? parts[parts.length - 2][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function Avatar({ name, className = "size-8 text-xs" }: { name: string; className?: string }) {
  return <span className={cn("grid shrink-0 place-items-center rounded-full font-semibold ring-1", toneFor(name), className)} aria-hidden>{initials(name)}</span>;
}

/** Rounded square with letters, for products and companies (never their trademarks). */
export function LetterSquare({ seed, label, className = "size-10 text-sm" }: { seed: string; label: string; className?: string }) {
  return <span className={cn("grid shrink-0 place-items-center rounded-xl font-semibold ring-1", toneFor(seed), className)} aria-hidden>{label}</span>;
}

export type DotTone = "ok" | "warn" | "err" | "info" | "off";
const DOT: Record<DotTone, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", err: "bg-red-500", info: "bg-primary", off: "bg-zinc-300 dark:bg-zinc-600" };
export function Dot({ tone, className }: { tone: DotTone; className?: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", DOT[tone], className)} aria-hidden />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("h-3 animate-pulse rounded-full bg-foreground/5 motion-reduce:animate-none", className)} />;
}

/** Two-line load error with a retry button (empty-state.md, "Lỗi tải"). */
export function LoadError({ title, reason, onRetry }: { title: string; reason?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
      <div>
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{title}</p>
        {reason && <p className="mt-1 text-sm text-muted">{reason}</p>}
      </div>
      {onRetry && (
        <Button icon={RotateCw} onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </div>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Command or config block with a copy button; long lines wrap instead of scrolling. */
export function CodeBlock({ code, copyLabel = "Chép" }: { code: string; copyLabel?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative rounded-xl bg-background">
      <pre className="px-4 py-3 pr-14 font-mono text-[13px] leading-6 whitespace-pre-wrap text-foreground [overflow-wrap:anywhere]">{code}</pre>
      <button
        type="button"
        aria-label={copyLabel}
        title={copyLabel}
        onClick={async () => {
          if (await copyText(code)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
        className="absolute top-1.5 right-1.5 inline-flex size-8 items-center justify-center rounded-lg text-muted outline-hidden hover:bg-foreground/8 hover:text-foreground"
      >
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Đã chép" : ""}
      </span>
    </div>
  );
}

export function Card({ title, action, children, className, flush }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-surface", flush ? "py-5" : "p-5", className)}>
      {(title || action) && (
        <header className={cn("flex items-start justify-between gap-3", flush ? "px-5" : "mb-4", flush && !action && "mb-1.5")}>
          <div className={cn("flex min-w-0 items-center gap-2", Boolean(action) && "min-h-10")}>
            {typeof title === "string" ? <h2 className="text-base font-semibold text-balance">{title}</h2> : title}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={cn("min-h-0 flex-1", flush && "px-2")}>{children}</div>
    </section>
  );
}

/** Input with the skill's focus treatment (border + 2px faint ring). */
export const inputClass =
  "h-11 w-full rounded-xl border border-border-strong bg-surface px-4 text-base text-foreground outline-hidden transition-colors placeholder:text-muted focus:border-focus focus:ring-2 focus:ring-focus md:h-10 md:text-sm aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/10";
