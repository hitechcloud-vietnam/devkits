import { NextResponse } from "next/server";
import { ensureBootstrapOperator, failedLoginDelay, sameOrigin, startSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import { authConfigured } from "@/lib/session";

// Operator portal sign-in. Operator accounts are separate from user accounts.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  if (!authConfigured(process.env)) {
    return NextResponse.json({ error: "Máy chủ chưa cấu hình DEVKITS_SESSION_SECRET (tối thiểu 32 ký tự)." }, { status: 503 });
  }
  await ensureBootstrapOperator();
  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const db = await getDb();
  const op = email ? await repo.getOperatorForLogin(db, email) : null;
  if (!op || !(await verifyPassword(password, op.passwordHash))) {
    await failedLoginDelay();
    if ((await repo.countOperators(db)) === 0) {
      return NextResponse.json({ error: "Chưa có người vận hành nào. Đặt DEVKITS_OPS_BOOTSTRAP_EMAIL và DEVKITS_OPS_BOOTSTRAP_PASSWORD trên máy chủ." }, { status: 503 });
    }
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng." }, { status: 401 });
  }
  await repo.touchOperator(db, op.id);
  return startSession(NextResponse.json({ ok: true }), "ops", op.id);
}
