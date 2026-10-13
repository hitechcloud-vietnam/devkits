import "server-only";

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** JSON GET with a timeout. Error messages never include request headers (tokens). */
export async function getJson<T>(url: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  } catch (err) {
    const reason = err instanceof Error && err.name === "TimeoutError" ? "quá thời gian chờ" : "lỗi mạng";
    throw new IntegrationError(`${new URL(url).host}: ${reason}`);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string; error?: { message?: string } };
      detail = body.error?.message || body.message || "";
    } catch {
      // non-JSON error body
    }
    throw new IntegrationError(`${new URL(url).host} trả về ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
  }
  return (await res.json()) as T;
}
