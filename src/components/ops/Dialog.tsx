"use client";

import { X, type LucideIcon } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, cn } from "@/components/ui/primitives";

// Modal and confirm dialog per layouts/overlay.md: scrim bg-black/30, rounded-2xl, shadow-modal.
// Forms do not close on outside click (I20); Esc closes unless a request is running.

function useDialogKeys(open: boolean, busy: boolean, onClose: () => void, initialFocus: () => HTMLElement | null) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => initialFocus()?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
    // initialFocus is read once when opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy, onClose]);
}

function Layer({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/30 px-4 pt-16 pb-8 sm:items-center sm:pt-8">{children}</div>,
    document.body,
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  busy = false,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogKeys(open, busy, onClose, () => ref.current?.querySelector<HTMLElement>("input, textarea, select, [data-autofocus]") ?? null);
  if (!open) return null;
  return (
    <Layer>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog-pop w-full max-w-lg rounded-2xl border border-border bg-surface shadow-modal">
        <div className="relative px-6 pt-6 pr-14">
          <h2 id={titleId} className="text-lg font-semibold text-balance">
            {title}
          </h2>
          {description && <div className="mt-2 text-sm/6 text-pretty text-muted">{description}</div>}
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            disabled={busy}
            className="absolute top-4 right-4 inline-flex size-10 items-center justify-center rounded-xl text-muted outline-hidden hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="px-6 pt-6 pb-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 px-6 pb-6 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </Layer>
  );
}

export function ConfirmDialog({
  open,
  icon: Icon,
  title,
  children,
  confirmLabel,
  danger = true,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogKeys(open, busy, onClose, () => cancelRef.current);
  if (!open) return null;
  return (
    <Layer>
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId} className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-modal">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4">
          <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", danger ? "bg-rose-500/10" : "bg-background")}>
            <Icon className={cn("size-5", danger ? "text-rose-700 dark:text-rose-400" : "text-foreground")} aria-hidden />
          </div>
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <div id={descId} className="col-span-2 mt-2 min-w-0 text-sm/6 text-muted sm:col-span-1 sm:col-start-2 sm:mt-0.5">
            {children}
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-secondary px-4 text-sm font-medium text-foreground outline-hidden hover:bg-secondary-hover disabled:opacity-50 md:min-h-10"
          >
            Huỷ
          </button>
          <Button variant={danger ? "danger" : "primary"} loading={busy} onClick={onConfirm} className="min-h-11 md:min-h-10">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Layer>
  );
}
