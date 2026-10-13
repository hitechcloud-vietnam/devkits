// Stateless, HMAC-signed session tokens bound to one portal. Uses Web Crypto only so it
// runs in the proxy, route handlers, and Node's test runner alike. No project imports.

export type Portal = "user" | "ops";

export const SESSION_COOKIES: Record<Portal, string> = { user: "dk_user", ops: "dk_ops" };
export const SESSION_TTL_MS: Record<Portal, number> = {
  user: 14 * 24 * 60 * 60 * 1000,
  ops: 12 * 60 * 60 * 1000, // operators re-authenticate daily
};
const VERSION = "v2";

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

async function sha256(data: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(data)));
}

/** Constant-time comparison of two strings (hashes both to equal length first). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

export async function createSessionToken(secret: string, portal: Portal, subject: string, now = Date.now()): Promise<string> {
  if (!/^[\w-]+$/.test(subject)) throw new Error("Invalid session subject");
  const payload = `${VERSION}.${portal}.${subject}.${now + SESSION_TTL_MS[portal]}`;
  return `${payload}.${await hmac(secret, payload)}`;
}

/** Returns the subject id when the token is valid for this portal, otherwise null. */
export async function verifySessionToken(token: string | undefined, secret: string, portal: Portal, now = Date.now()): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION || parts[1] !== portal) return null;
  const exp = Number(parts[3]);
  if (!Number.isFinite(exp) || exp <= now) return null;
  const expected = await hmac(secret, parts.slice(0, 4).join("."));
  return (await safeEqual(parts[4], expected)) ? parts[2] : null;
}

/** The signing secret must exist and be long enough to resist guessing. */
export function authConfigured(env: Record<string, string | undefined>): boolean {
  return (env.DEVKITS_SESSION_SECRET ?? "").length >= 32;
}
