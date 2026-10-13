import { NextResponse } from "next/server";
import { forbidden, handle, readJson } from "@/lib/api";
import { getCurrentOperator, sameOrigin, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    if (!(await getCurrentOperator())) return unauthorized();
    return NextResponse.json({ users: await repo.listUsers(await getDb()) });
  });
}

/**
 * Invites a user. No email service is configured, so the response carries the one-time
 * invite link for the operator to send; it is not shown again.
 */
export async function POST(request: Request) {
  return handle(async () => {
    if (!sameOrigin(request)) return forbidden("Yêu cầu không hợp lệ.");
    const op = await getCurrentOperator();
    if (!op) return unauthorized();
    const body = await readJson<{ email: string; role: repo.Role }>(request);
    const role: repo.Role = body.role === "readonly" ? "readonly" : "member";
    const db = await getDb();
    const { user, inviteSecret } = await repo.inviteUser(db, { email: String(body.email ?? ""), role, invitedBy: op.id });
    await repo.audit(db, { actorType: "operator", actorId: op.id, actorName: op.name, action: "mời", target: user.email });
    const origin = process.env.DEVKITS_PUBLIC_URL || new URL(request.url).origin;
    return NextResponse.json(
      { user, inviteUrl: `${origin}/accept-invite?code=${encodeURIComponent(inviteSecret)}`, expiresInDays: repo.INVITE_TTL_DAYS },
      { status: 201 },
    );
  });
}
