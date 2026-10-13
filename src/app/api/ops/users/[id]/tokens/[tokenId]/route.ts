import { NextResponse } from "next/server";
import { forbidden, handle, notFound } from "@/lib/api";
import { getCurrentOperator, sameOrigin, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";

/** Operator revokes a user's token (e.g. a leaked or lost-device token). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; tokenId: string }> }) {
  return handle(async () => {
    if (!sameOrigin(request)) return forbidden("Yêu cầu không hợp lệ.");
    const op = await getCurrentOperator();
    if (!op) return unauthorized();
    const { id, tokenId } = await params;
    const db = await getDb();
    const token = (await repo.listTokens(db, id)).find((t) => t.id === tokenId);
    if (!token || !(await repo.revokeToken(db, id, tokenId))) return notFound("Không tìm thấy token.");
    await repo.audit(db, { actorType: "operator", actorId: op.id, actorName: op.name, action: "thu hồi token", target: token.name });
    return NextResponse.json({ ok: true });
  });
}
