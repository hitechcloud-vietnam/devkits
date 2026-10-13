import { NextResponse } from "next/server";
import { failedLoginDelay, sameOrigin, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import { authConfigured } from "@/lib/session";

// User portal sign-in (email + password). Operators sign in at /api/ops/auth/login.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  if (!authConfigured(process.env)) {
    return NextResponse.json({ error: "Máy chủ chưa cấu hình DEVKITS_SESSION_SECRET (tối thiểu 32 ký tự)." }, { status: 503 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const db = await getDb();
  const user = email ? await repo.getUserForLogin(db, email) : null;
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    await failedLoginDelay();
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng." }, { status: 401 });
  }
  if (user.status === "suspended") {
    return NextResponse.json({ error: "Tài khoản đang tạm khoá. Liên hệ người vận hành DevKits." }, { status: 403 });
  }
  await repo.touchUser(db, user.id);
  return startSession(NextResponse.json({ ok: true }), "user", user.id);
}
