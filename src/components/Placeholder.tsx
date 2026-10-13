"use client";

import { AppShell } from "@/components/ui/AppShell";
import { useAccount } from "@/components/session-context";
import { OPS_NAV, USER_NAV } from "@/lib/nav";

/** Temporary page body while a screen is being built. */
export function Placeholder({ portal, href, title }: { portal: "user" | "ops"; href: string; title: string }) {
  const account = useAccount();
  return (
    <AppShell portal={portal} nav={portal === "user" ? USER_NAV : OPS_NAV} activeHref={href} account={account} title={title}>
      <div className="p-4 sm:p-6">
        <p className="text-sm text-muted">Màn này đang được dựng.</p>
      </div>
    </AppShell>
  );
}
