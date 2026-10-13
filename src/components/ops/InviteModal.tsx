"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ops/Dialog";
import { Button, CodeBlock, cn, inputClass } from "@/components/ui/primitives";

export type Role = "member" | "readonly";

export const ROLES: { value: Role; label: string; desc: string }[] = [
  { value: "member", label: "Thành viên", desc: "Trò chuyện, tạo token MCP cho agent" },
  { value: "readonly", label: "Chỉ đọc", desc: "Trò chuyện, không tạo token" },
];

export interface InviteResult {
  email: string;
  inviteUrl: string;
  expiresInDays: number;
}

/** Shows a freshly created one-time invite link (used by the invite form and by "Gửi lại lời mời"). */
export function InviteLinkModal({ result, onClose }: { result: InviteResult | null; onClose: () => void }) {
  return (
    <Modal
      open={result !== null}
      title="Gửi link mời"
      description={
        <>
          Link cho <span className="font-medium text-foreground [overflow-wrap:anywhere]">{result?.email}</span> chỉ hiện một lần và hết hạn sau {result?.expiresInDays} ngày. Chép
          rồi gửi qua kênh nội bộ.
        </>
      }
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose} className="min-h-11 md:min-h-10" data-autofocus>
          Xong
        </Button>
      }
    >
      {result && <CodeBlock code={result.inviteUrl} copyLabel="Chép link mời" />}
    </Modal>
  );
}

export function InviteModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: (r: InviteResult) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setEmail("");
    setRole("member");
    setError(null);
    setFormError(null);
    onClose();
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Email phải có dạng ten@congty.vn.");
      return;
    }
    setBusy(true);
    setError(null);
    setFormError(null);
    try {
      const res = await fetch("/api/ops/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; user?: { email: string }; inviteUrl?: string; expiresInDays?: number };
      if (res.status === 401) {
        window.location.href = "/ops/login";
        return;
      }
      if (!res.ok) {
        if (body.code === "exists" || body.code === "invalid") setError(body.error ?? "Email không dùng được.");
        else setFormError(body.error ?? `Không tạo được lời mời (${res.status}).`);
        return;
      }
      setEmail("");
      setRole("member");
      onInvited({ email: body.user!.email, inviteUrl: body.inviteUrl!, expiresInDays: body.expiresInDays ?? 7 });
    } catch {
      setFormError("Không kết nối được máy chủ. Thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Mời người dùng"
      description="Người được mời đặt mật khẩu qua link một lần rồi đăng nhập ở portal DevKits. Họ không vào được trang vận hành."
      onClose={close}
      busy={busy}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <div>
          <label htmlFor="invite-email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "invite-email-error" : undefined}
            placeholder="ten@hitechcloud.vn"
            className={inputClass}
          />
          {error && (
            <p id="invite-email-error" className="mt-1.5 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Vai trò</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-xl border bg-surface px-4 py-3 transition-colors",
                  role === r.value ? "border-focus ring-2 ring-focus" : "border-border-strong hover:bg-surface-hover",
                )}
              >
                <input type="radio" name="invite-role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} className="sr-only" />
                <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", role === r.value ? "border-primary bg-primary" : "border-border-strong bg-surface")}>{role === r.value && <span className="size-1.5 rounded-full bg-primary-foreground" />}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-muted">{r.desc}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {formError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {formError}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={close} disabled={busy} className="min-h-11 md:min-h-10">
            Huỷ
          </Button>
          <Button type="submit" variant="primary" loading={busy} className="min-h-11 md:min-h-10">
            Tạo lời mời
          </Button>
        </div>
      </form>
    </Modal>
  );
}
