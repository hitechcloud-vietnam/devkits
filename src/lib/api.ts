import "server-only";
import { NextResponse } from "next/server";
import { RepoError } from "@/lib/db/repo";

const STATUS: Record<RepoError["code"], number> = { exists: 409, duplicate_name: 409, invalid: 400, not_found: 404 };

/** Runs a handler and turns repository errors into JSON responses with the right status. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RepoError) return NextResponse.json({ error: err.message, code: err.code }, { status: STATUS[err.code] });
    console.error("api error", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Lỗi máy chủ. Thử lại sau ít phút." }, { status: 500 });
  }
}

export async function readJson<T extends object>(request: Request): Promise<Partial<T>> {
  return (await request.json().catch(() => ({}))) as Partial<T>;
}

export const notFound = (message = "Không tìm thấy.") => NextResponse.json({ error: message }, { status: 404 });
export const forbidden = (message = "Bạn không có quyền làm việc này.") => NextResponse.json({ error: message }, { status: 403 });
