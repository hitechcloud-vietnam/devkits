"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/components/ui/primitives";

/**
 * Centered dialog (overlay.md): bg-black/30 scrim, surface panel with a hairline and modal
 * shadow. Forms do not close on outside click (I20); Escape closes unless `busy`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeOnBackdrop = false,
  busy = false,
  labelledBy = "modal-title",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
  busy?: boolean;
  labelledBy?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocus.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>("[data-autofocus], input, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      lastFocus.current?.focus?.();
    };
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <div className="absolute inset-0 bg-black/30" aria-hidden onClick={() => closeOnBackdrop && !busy && onClose()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="dialog-pop relative w-full max-w-md rounded-2xl border border-border bg-surface shadow-modal"
      >
        <div className="flex items-start gap-3 px-6 pt-5">
          <div className="min-w-0 flex-1">
            <h2 id={labelledBy} className="text-base font-semibold text-balance">
              {title}
            </h2>
            {description && <div className="mt-1 text-sm text-muted text-pretty">{description}</div>}
          </div>
          <button
            type="button"
            data-close
            aria-label="Đóng"
            disabled={busy}
            onClick={onClose}
            className="-mt-1 -mr-2 inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-muted outline-hidden hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {children && <div className="px-6 pt-4">{children}</div>}
        {footer && <div className={cn("flex flex-col-reverse gap-2 px-6 pt-5 pb-5 sm:flex-row sm:justify-end")}>{footer}</div>}
        {!footer && <div className="pb-5" />}
      </div>
    </div>
  );
}
