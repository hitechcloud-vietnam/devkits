import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIES, authConfigured, verifySessionToken, type Portal } from "@/lib/session";

// Two independent portals, each with its own login and cookie:
//   user portal      → /, /agent, /api/chat, /api/me/*        (cookie dk_user)
//   operator portal  → /ops/*, /api/ops/*                      (cookie dk_ops)
// /api/mcp authenticates agents with bearer tokens instead.
const PUBLIC_PATHS = new Set([
  "/login",
  "/accept-invite",
  "/api/auth/login",
  "/api/auth/accept",
  "/api/mcp",
  "/ops/login",
  "/api/ops/auth/login",
]);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const portal: Portal = pathname === "/ops" || pathname.startsWith("/ops/") || pathname.startsWith("/api/ops/") ? "ops" : "user";
  const ok =
    authConfigured(process.env) &&
    (await verifySessionToken(request.cookies.get(SESSION_COOKIES[portal])?.value, process.env.DEVKITS_SESSION_SECRET!, portal)) !== null;
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const login = new URL(portal === "ops" ? "/ops/login" : "/login", request.url);
  if (pathname !== "/" && pathname !== "/ops") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
