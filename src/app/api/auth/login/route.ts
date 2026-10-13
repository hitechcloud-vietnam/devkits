import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_MS, authConfigured, createSessionToken, safeEqual } from "@/lib/session";

export async function POST(request: Request) {
  if (!authConfigured(process.env)) {
    return NextResponse.json(
      { error: "Login is not configured. Set DEVKITS_ACCESS_PASSWORD and DEVKITS_SESSION_SECRET (32+ chars)." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    if (typeof body.password === "string") password = body.password;
  } catch {
    // fall through with empty password
  }

  if (!password || !(await safeEqual(password, process.env.DEVKITS_ACCESS_PASSWORD!))) {
    // Slow down guessing; serverless instances do not share state, so this is a deterrent, not a lockout.
    await new Promise((r) => setTimeout(r, 800));
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(process.env.DEVKITS_SESSION_SECRET!), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return res;
}
