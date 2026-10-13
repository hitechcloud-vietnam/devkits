import { NextResponse } from "next/server";
import { sameOrigin, startSession } from "@/lib/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/crypto";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";

// Accepts a one-time invitation: sets name and password, activates the account, signs in.
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { secret?: unknown; name?: unknown; password?: unknown };
  const secret = typeof body.secret === "string" ? body.secret : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Nhập họ tên.";
  if (password.length < PASSWORD_MIN_LENGTH) errors.password = `Mật khẩu tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`;
  if (Object.keys(errors).length) return NextResponse.json({ error: "Thông tin chưa hợp lệ.", fields: errors }, { status: 400 });

  const db = await getDb();
  const user = await repo.acceptInvite(db, secret, { name, password });
  if (!user) {
    return NextResponse.json({ error: "Lời mời không còn hiệu lực. Nhờ người vận hành gửi lại lời mời." }, { status: 410 });
  }
  await repo.audit(db, { actorType: "user", actorId: user.id, actorName: user.name, action: "kích hoạt tài khoản", target: user.email });
  return startSession(NextResponse.json({ ok: true }), "user", user.id);
}
