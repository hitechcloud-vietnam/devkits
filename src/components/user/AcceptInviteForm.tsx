"use client";

import { useState, type FormEvent } from "react";
import { Button, inputClass } from "@/components/ui/primitives";

const PASSWORD_MIN = 10;

export function AcceptInviteForm({ code, email }: { code: string; email: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!name.trim()) local.name = "Nhập họ tên.";
    if (password.length < PASSWORD_MIN) local.password = `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự.`;
    setFields(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: code, name, password }),
      });
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
      if (res.status === 410) setGone(body.error ?? "Lời mời không còn hiệu lực.");
      else {
        setFields(body.fields ?? {});
        setError(body.fields ? null : (body.error ?? "Không kích hoạt được tài khoản."));
      }
    } catch {
      setError("Không kết nối được máy chủ.");
    } finally {
      setBusy(false);
    }
  }

  if (gone) return <p className="text-sm text-muted">{gone}</p>;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <p className="mb-1.5 text-sm font-medium">Email</p>
        <p className="flex h-11 min-w-0 items-center rounded-xl bg-background px-4 text-sm text-muted md:h-10" title={email}>
          <span className="min-w-0 truncate">{email.split("@")[0]}</span>
          <span className="shrink-0">@{email.split("@")[1]}</span>
        </p>
      </div>
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
          Họ tên
        </label>
        <input
          id="name"
          autoComplete="name"
          autoFocus
          className={inputClass}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={fields.name ? true : undefined}
          aria-describedby={fields.name ? "name-error" : undefined}
        />
        {fields.name && (
          <p id="name-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
            {fields.name}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium">
          Mật khẩu
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={fields.password ? true : undefined}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className={fields.password ? "mt-1.5 text-sm text-red-600 dark:text-red-400" : "mt-1.5 text-sm text-muted"}>
          {fields.password ?? `Tối thiểu ${PASSWORD_MIN} ký tự.`}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={busy} className="min-h-11 w-full md:min-h-10">
        Kích hoạt tài khoản
      </Button>
    </form>
  );
}
