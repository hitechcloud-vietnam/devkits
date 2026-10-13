"use client";

import { ExternalLink, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/ui/AppShell";
import { Button } from "@/components/ui/primitives";
import { useAccount } from "@/components/session-context";
import { HealthCard, useHealth } from "@/components/ops/health";
import { OPS_NAV } from "@/lib/nav";

// Stopgap screen (not in the approved brief): the health list plus where plugins are published.
export function Integrations() {
  const account = useAccount();
  const health = useHealth();
  return (
    <AppShell
      portal="ops"
      nav={OPS_NAV}
      activeHref="/ops/integrations"
      account={account}
      title="Tích hợp"
      actions={
        <Button icon={RefreshCw} loading={health.loading} onClick={() => void health.reload()}>
          Kiểm tra lại
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-3 p-4 sm:p-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <HealthCard checks={health.checks} loading={health.loading} error={health.error} onRetry={() => void health.reload()} />
        </div>
        <section className="min-w-0 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold">Kênh phân phối</h2>
          <p className="mt-2 text-sm text-muted">
            Plugin, extension và cấu hình MCP cho từng nền tảng AI được sinh từ repo DevKits. Người dùng xem lệnh cài trong portal DevKits, mục Kết nối agent.
          </p>
          <a
            href="https://github.com/hitechcloud-vietnam/devkits/blob/main/integrations/README.md"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border-strong bg-surface px-4 py-2 text-sm font-medium outline-hidden hover:bg-button-hover"
          >
            <ExternalLink className="size-4" aria-hidden />
            Hướng dẫn cài theo nền tảng
          </a>
        </section>
      </div>
    </AppShell>
  );
}
