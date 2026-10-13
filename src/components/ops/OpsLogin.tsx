"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button, inputClass } from "@/components/ui/primitives";

export function OpsLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Nhập email và mật khẩu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = next && next.startsWith("/ops") && !next.startsWith("//") ? next : "/ops";
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? `Đăng nhập không thành công (${res.status}).`);
    } catch {
      setError("Không kết nối được máy chủ. Thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <form onSubmit={submit} noValidate className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/hitechcloud.svg" alt="HiTechCloud" className="h-8 w-auto" />
            <span className="h-5 w-px bg-border-strong" />
            <span className="text-sm font-semibold">Vận hành</span>
          </div>
          <h1 className="mt-6 text-xl font-semibold">Đăng nhập vận hành</h1>
          <p className="mt-1 text-sm text-muted">Dành cho người quản trị DevKits.</p>
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <label htmlFor="ops-email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input id="ops-email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="ops-password" className="mb-1.5 block text-sm font-medium">
                Mật khẩu
              </label>
              <input id="ops-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
            </div>
          </div>
          {error && (
            <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={busy} className="mt-6 min-h-11 w-full md:min-h-10">
            Đăng nhập
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Bạn là người dùng?{" "}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Đăng nhập DevKits
          </Link>
        </p>
      </div>
    </main>
  );
}
