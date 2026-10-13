import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { getAiConfig } from "@/lib/config";
import { sanitizeAfterFallback } from "@/lib/history";
import { isClientTool, runTool, toolDefinitions } from "@/lib/tools";

// Events streamed to the browser. `messages` carries the exact API messages to
// append to history (assistant turns are echoed back unchanged on later
// requests so thinking blocks stay valid).
export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: string; input?: unknown; server: boolean }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "fallback"; from: string; to: string }
  | { type: "messages"; messages: BetaMessageParam[] }
  | { type: "done"; stopReason: string | null; model: string; usage: { input: number; output: number } }
  | { type: "error"; message: string; retryable: boolean };

const MAX_ITERATIONS = 12;
const MAX_TOKENS = 32_000;

const SYSTEM_PROMPT = `You are the AI assistant inside HiTechCloud DevKits, the internal AI workspace of HiTechCloud (Pho Tue Software Solutions JSC), a Vietnamese cloud and software company.

You help the operator with any kind of work: engineering, cloud and infrastructure, documents and contracts, research, business operations, and planning. Work out what outcome they actually want; when the request is ambiguous in a way that would materially change the result, ask one focused question. Otherwise proceed with sensible defaults and state the assumptions that matter.

Reply in the language the operator writes in (often Vietnamese). Use Markdown for structure when it helps; keep answers direct.

Tools:
- GitHub and Vercel tools are read-only. Use them to ground answers about the DevKits repository, deployments, build logs and domains instead of guessing.
- If a tool reports that an integration is not configured, say so plainly and name the environment variable the operator must set.
- Web search is available for current or external facts; cite the sources you relied on.

Honesty about actions: you cannot change anything outside this conversation. Never claim that you deployed, merged, edited, connected or verified something unless a tool result in this conversation shows it. When a change is needed (code edit, deployment, DNS, credentials), present it as a proposal with the exact steps or commands for a human to review and run, and flag anything destructive or production-impacting.

For legal, tax, accounting or compliance questions, note jurisdiction and uncertainty and recommend qualified review where the stakes warrant it.`;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export async function* runAgent(history: BetaMessageParam[], signal: AbortSignal): AsyncGenerator<AgentEvent> {
  const cfg = getAiConfig();
  if (!cfg.apiKeyPresent) {
    yield { type: "error", message: "ANTHROPIC_API_KEY is not set on the server.", retryable: false };
    return;
  }

  const messages = [...history];
  const tools = toolDefinitions({ webSearch: cfg.webSearch });
  const usage = { input: 0, output: 0 };
  let jsonRetries = 0;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let message: BetaMessage;
    try {
      const stream = anthropic().beta.messages.stream(
        {
          model: cfg.model,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          thinking: { type: "adaptive", display: "summarized" },
          output_config: { effort: cfg.effort },
          cache_control: { type: "ephemeral" },
          // Server-side refusal fallback, routed by refusal category.
          fallbacks: "default",
          betas: ["server-side-fallback-2026-07-01"],
        },
        { signal },
      );

      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") yield { type: "text", text: event.delta.text };
          else if (event.delta.type === "thinking_delta") yield { type: "thinking", text: event.delta.thinking };
        } else if (event.type === "content_block_start") {
          const block = event.content_block as BetaContentBlock;
          if (block.type === "tool_use" || block.type === "server_tool_use") {
            yield { type: "tool_call", id: block.id, name: block.name, server: block.type === "server_tool_use" };
          } else if (block.type === "web_search_tool_result") {
            const ok = Array.isArray(block.content);
            yield {
              type: "tool_result",
              id: block.tool_use_id,
              ok,
              summary: ok ? `${(block.content as unknown[]).length} results` : "Search failed",
            };
          } else if ((block as { type: string }).type === "fallback") {
            const fb = block as unknown as { from: { model: string }; to: { model: string } };
            yield { type: "fallback", from: fb.from.model, to: fb.to.model };
          }
        }
      }
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof Anthropic.APIError) {
        yield { type: "error", ...describeApiError(err) };
        return;
      }
      // Tool input JSON that could not be parsed at all (eager input streaming): re-issue the turn.
      if (jsonRetries++ < 2) continue;
      yield { type: "error", message: "The model produced malformed tool input repeatedly.", retryable: true };
      return;
    }

    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;

    if (message.stop_reason === "refusal") {
      // Whole fallback chain declined; do not keep the partial in history.
      yield { type: "error", message: "The request was declined by the model's safety system.", retryable: false };
      yield { type: "done", stopReason: "refusal", model: message.model, usage };
      return;
    }

    const { content, liveFrom } = sanitizeAfterFallback(message.content);
    const assistant: BetaMessageParam = { role: "assistant", content: content as BetaMessageParam["content"] };

    if (message.stop_reason === "pause_turn") {
      messages.push(assistant);
      yield { type: "messages", messages: [assistant] };
      continue;
    }

    const toolUses = content
      .slice(Math.max(liveFrom, 0))
      .filter((b): b is BetaToolUseBlock => b.type === "tool_use");

    if (toolUses.length === 0 || message.stop_reason !== "tool_use") {
      if (message.stop_reason === "max_tokens" && toolUses.length > 0) {
        yield { type: "error", message: "The response hit the output limit in the middle of a tool call.", retryable: true };
        return;
      }
      messages.push(assistant);
      yield { type: "messages", messages: [assistant] };
      yield { type: "done", stopReason: message.stop_reason, model: message.model, usage };
      return;
    }

    // Run all tool calls of this turn concurrently; return every result in one user message.
    const outcomes = await Promise.all(
      toolUses.map((tu) =>
        isClientTool(tu.name)
          ? runTool(tu.name, tu.input)
          : Promise.resolve({ ok: false, content: `Unknown tool ${tu.name}`, summary: "Unknown tool" }),
      ),
    );
    const results: BetaToolResultBlockParam[] = toolUses.map((tu, i) => ({
      type: "tool_result",
      tool_use_id: tu.id,
      is_error: !outcomes[i].ok,
      content: outcomes[i].content,
    }));
    for (const [i, tu] of toolUses.entries()) {
      yield { type: "tool_call", id: tu.id, name: tu.name, input: tu.input, server: false };
      yield { type: "tool_result", id: tu.id, ok: outcomes[i].ok, summary: outcomes[i].summary };
    }

    const toolTurn: BetaMessageParam = { role: "user", content: results };
    messages.push(assistant, toolTurn);
    yield { type: "messages", messages: [assistant, toolTurn] };
  }

  yield { type: "error", message: `Stopped after ${MAX_ITERATIONS} tool rounds. Ask me to continue if needed.`, retryable: true };
}

function describeApiError(err: InstanceType<typeof Anthropic.APIError>): { message: string; retryable: boolean } {
  if (err instanceof Anthropic.AuthenticationError) return { message: "The Anthropic API key was rejected.", retryable: false };
  if (err instanceof Anthropic.PermissionDeniedError) return { message: "The API key lacks permission for this model or feature.", retryable: false };
  if (err instanceof Anthropic.RateLimitError) return { message: "Rate limited by the Anthropic API. Try again shortly.", retryable: true };
  if (err instanceof Anthropic.BadRequestError) return { message: `The API rejected the request: ${err.message}`, retryable: false };
  if (err instanceof Anthropic.APIConnectionError) return { message: "Could not reach the Anthropic API.", retryable: true };
  return { message: `Anthropic API error${err.status ? ` ${err.status}` : ""}.`, retryable: (err.status ?? 500) >= 500 };
}
