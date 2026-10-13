"use client";

import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Đăng nhập thất bại.");
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark" aria-hidden>
          DK
        </div>
        <h1>HiTechCloud DevKits</h1>
        <p>Không gian làm việc AI nội bộ. Đăng nhập để tiếp tục.</p>
        <label htmlFor="password">Mật khẩu truy cập</label>
        <input
          id="password"
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
        />
        {error && (
          <div className="login-error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn-primary" disabled={busy || !password}>
          {busy ? "Đang kiểm tra…" : "Đăng nhập"}
        </button>
      </form>
    </main>
  );
}
