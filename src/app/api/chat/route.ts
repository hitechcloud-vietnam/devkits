import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { runAgent, type AgentEvent } from "@/lib/agent";
import { getCurrentUser, sameOrigin, unauthorized } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { recordUsage } from "@/lib/db/repo";
import { validateHistory } from "@/lib/history";
import { costMicros } from "@/lib/pricing";

// Long agentic turns: allow up to 5 minutes on Vercel Functions.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-origin request rejected" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return unauthorized();

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
        for await (const event of runAgent(body.messages as BetaMessageParam[], request.signal)) {
          send(event);
          if (event.type === "done") {
            const db = await getDb();
            await recordUsage(db, {
              userId: user.id,
              kind: "chat",
              inputTokens: event.usage.input,
              outputTokens: event.usage.output,
              costMicros: costMicros(event.model, event.usage.input, event.usage.output),
            }).catch((err) => console.error("usage record failed", err instanceof Error ? err.message : err));
          }
        }
      } catch (err) {
        console.error("chat stream failed", err instanceof Error ? err.message : err);
        send({ type: "error", message: "Lỗi máy chủ. Thử lại sau ít phút.", retryable: true });
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
