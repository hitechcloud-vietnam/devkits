import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import * as repo from "@/lib/db/repo";
import { SESSION_COOKIES, SESSION_TTL_MS, createSessionToken, verifySessionToken, type Portal } from "@/lib/session";

// Server-side identity for the two portals. The proxy only checks cookie signatures;
// these helpers also check the database, so a suspended user loses access immediately.

function secret(): string {
  const s = process.env.DEVKITS_SESSION_SECRET ?? "";
  if (s.length < 32) throw new Error("DEVKITS_SESSION_SECRET must be at least 32 characters.");
  return s;
}

async function subject(portal: Portal): Promise<string | null> {
  if ((process.env.DEVKITS_SESSION_SECRET ?? "").length < 32) return null;
  const jar = await cookies();
  return verifySessionToken(jar.get(SESSION_COOKIES[portal])?.value, secret(), portal);
}

/** Active user of the user portal, or null. */
export async function getCurrentUser(): Promise<repo.User | null> {
  const id = await subject("user");
  if (!id) return null;
  const db = await getDb();
  const user = await repo.getUser(db, id);
  if (!user || user.status !== "active") return null;
  void repo.touchUser(db, id).catch(() => {});
  return user;
}

/** Signed-in operator of the operator portal, or null. */
export async function getCurrentOperator(): Promise<repo.Operator | null> {
  const id = await subject("ops");
  if (!id) return null;
  const db = await getDb();
  const op = await repo.getOperator(db, id);
  if (op) void repo.touchOperator(db, id).catch(() => {});
  return op;
}

export function unauthorized(message = "Phiên đăng nhập đã hết hạn. Đăng nhập lại.") {
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function startSession(res: NextResponse, portal: Portal, id: string): Promise<NextResponse> {
  res.cookies.set(SESSION_COOKIES[portal], await createSessionToken(secret(), portal, id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS[portal] / 1000,
  });
  return res;
}

export function endSession(res: NextResponse, portal: Portal): NextResponse {
  res.cookies.delete(SESSION_COOKIES[portal]);
  return res;
}

/** Rejects cross-site form posts on top of SameSite cookies. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || new URL(origin).host === new URL(request.url).host;
}

/** Creates the first operator from DEVKITS_OPS_BOOTSTRAP_* when none exists yet. */
export async function ensureBootstrapOperator(): Promise<void> {
  const email = process.env.DEVKITS_OPS_BOOTSTRAP_EMAIL;
  const password = process.env.DEVKITS_OPS_BOOTSTRAP_PASSWORD;
  if (!email || !password) return;
  const db = await getDb();
  if ((await repo.countOperators(db)) > 0) return;
  const op = await repo.createOperator(db, { email, name: process.env.DEVKITS_OPS_BOOTSTRAP_NAME || "Quản trị", password });
  await repo.audit(db, { actorType: "system", actorName: "Hệ thống", action: "tạo người vận hành đầu tiên", target: op.email });
}

/** Small, uniform delay on failed logins (a deterrent; serverless instances share no state). */
export const failedLoginDelay = () => new Promise((r) => setTimeout(r, 700));
