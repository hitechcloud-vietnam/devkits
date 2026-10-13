import { NextResponse } from "next/server";
import { handle, readJson, forbidden } from "@/lib/api";
import { getCurrentUser, sameOrigin, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";

export const dynamic = "force-dynamic";
const EXPIRY_CHOICES = new Set([30, 90, 365]);

/** The signed-in user's active MCP tokens (masked). */
export async function GET() {
  return handle(async () => {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    return NextResponse.json({ tokens: await repo.listTokens(await getDb(), user.id) });
  });
}

/** Creates a token. The full secret is returned once, in this response only. */
export async function POST(request: Request) {
  return handle(async () => {
    if (!sameOrigin(request)) return forbidden("Yêu cầu không hợp lệ.");
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (user.role === "readonly") return forbidden("Tài khoản chỉ đọc không tạo được token MCP.");
    const body = await readJson<{ name: string; expiresInDays: number | null }>(request);
    const expires = body.expiresInDays == null ? null : Number(body.expiresInDays);
    if (expires !== null && !EXPIRY_CHOICES.has(expires)) return NextResponse.json({ error: "Hạn dùng không hợp lệ." }, { status: 400 });
    const db = await getDb();
    const { token, secret } = await repo.createToken(db, { userId: user.id, name: String(body.name ?? ""), expiresInDays: expires });
    await repo.audit(db, { actorType: "user", actorId: user.id, actorName: user.name, action: "tạo token cho", target: token.name });
    return NextResponse.json({ token, secret }, { status: 201 });
  });
}
