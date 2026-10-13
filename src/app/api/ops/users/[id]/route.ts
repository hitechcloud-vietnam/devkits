import { NextResponse } from "next/server";
import { forbidden, handle, notFound, readJson } from "@/lib/api";
import { getCurrentOperator, sameOrigin, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ id: string }> };

/** User detail for the operator portal: profile, active tokens, 7-day usage. */
export async function GET(_request: Request, { params }: Params) {
  return handle(async () => {
    if (!(await getCurrentOperator())) return unauthorized();
    const { id } = await params;
    const db = await getDb();
    const user = await repo.getUser(db, id);
    if (!user) return notFound("Không tìm thấy người dùng.");
    const [tokens, usage] = await Promise.all([repo.listTokens(db, id), repo.usageLast7Days(db, id)]);
    return NextResponse.json({ user, tokens, usage: usage.current });
  });
}

/** Change role, or suspend / reactivate an account. */
export async function PATCH(request: Request, { params }: Params) {
  return handle(async () => {
    if (!sameOrigin(request)) return forbidden("Yêu cầu không hợp lệ.");
    const op = await getCurrentOperator();
    if (!op) return unauthorized();
    const { id } = await params;
    const body = await readJson<{ role: repo.Role; status: "active" | "suspended" }>(request);
    const role = body.role === "member" || body.role === "readonly" ? body.role : undefined;
    const status = body.status === "active" || body.status === "suspended" ? body.status : undefined;
    if (!role && !status) return NextResponse.json({ error: "Không có thay đổi nào." }, { status: 400 });
    const db = await getDb();
    const before = await repo.getUser(db, id);
    if (!before) return notFound("Không tìm thấy người dùng.");
    const user = await repo.updateUser(db, id, { role, status });
    const label = before.name || before.email;
    if (status && status !== before.status) {
      await repo.audit(db, { actorType: "operator", actorId: op.id, actorName: op.name, action: status === "suspended" ? "tạm khoá" : "mở khoá", target: label });
    }
    if (role && role !== before.role) {
      await repo.audit(db, { actorType: "operator", actorId: op.id, actorName: op.name, action: "đổi vai trò của", target: label });
    }
    return NextResponse.json({ user });
  });
}
