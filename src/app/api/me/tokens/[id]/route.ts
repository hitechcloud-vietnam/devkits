import { NextResponse } from "next/server";
import { forbidden, handle, notFound } from "@/lib/api";
import { getCurrentUser, sameOrigin, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";

/** Revokes one of the signed-in user's tokens. Agents using it stop working immediately. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    if (!sameOrigin(request)) return forbidden("Yêu cầu không hợp lệ.");
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await params;
    const db = await getDb();
    const tokens = await repo.listTokens(db, user.id);
    const token = tokens.find((t) => t.id === id);
    if (!token || !(await repo.revokeToken(db, user.id, id))) return notFound("Không tìm thấy token.");
    await repo.audit(db, { actorType: "user", actorId: user.id, actorName: user.name, action: "thu hồi token", target: token.name });
    return NextResponse.json({ ok: true });
  });
}
