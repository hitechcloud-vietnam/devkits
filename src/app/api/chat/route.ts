import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { runAgent, type AgentEvent } from "@/lib/agent";
import { validateHistory } from "@/lib/history";

// Long agentic turns: allow up to 5 minutes on Vercel Functions.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Same-origin check on top of the SameSite session cookie.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  }

  let body: { messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const problem = validateHistory(body.messages);
  if (problem) return Response.json({ error: problem }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runAgent(body.messages as BetaMessageParam[], request.signal)) send(event);
      } catch (err) {
        console.error("chat stream failed", err instanceof Error ? err.message : err);
        send({ type: "error", message: "Unexpected server error.", retryable: true });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
