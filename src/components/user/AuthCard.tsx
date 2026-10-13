import type { ReactNode } from "react";

/** Centered sign-in card with the HiTechCloud logo (layouts/form.md, auth screens). */
export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/hitechcloud.svg" alt="HiTechCloud" className="h-8 w-auto" />
          <span className="h-5 w-px bg-border-strong" />
          <span className="text-sm font-semibold">DevKits</span>
        </div>
        <section className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-balance">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted text-pretty">{description}</p>}
          <div className="mt-6">{children}</div>
        </section>
        {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
      </div>
    </main>
  );
}
