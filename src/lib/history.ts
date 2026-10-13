// Pure helpers for the conversation history the browser stores and sends back.
// No project imports, so Node's test runner can load this file directly.

/** Minimal structural view of an API content block. */
export interface Block {
  type: string;
  [key: string]: unknown;
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string | Block[];
}

export const MAX_HISTORY_MESSAGES = 400;
export const MAX_HISTORY_BYTES = 4_000_000;

/**
 * Validates the history sent by the browser: only user/assistant roles,
 * starts with a user turn, ends with a non-empty user turn, bounded size.
 * Returns an error string, or null when valid.
 */
export function validateHistory(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return "messages must be a non-empty array";
  if (value.length > MAX_HISTORY_MESSAGES) return `conversation exceeds ${MAX_HISTORY_MESSAGES} messages`;
  if (JSON.stringify(value).length > MAX_HISTORY_BYTES) return "conversation is too large; start a new one";
  for (const m of value) {
    if (!m || typeof m !== "object") return "invalid message";
    const { role, content } = m as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") return "only user and assistant roles are accepted";
    if (typeof content !== "string" && !Array.isArray(content)) return "invalid message content";
    if (Array.isArray(content) && content.some((b) => !b || typeof b !== "object" || typeof (b as Block).type !== "string")) {
      return "invalid content block";
    }
  }
  if ((value[0] as HistoryMessage).role !== "user") return "conversation must start with a user message";
  const last = value[value.length - 1] as HistoryMessage;
  if (last.role !== "user") return "conversation must end with a user message";
  if (typeof last.content === "string" && !last.content.trim()) return "message is empty";
  return null;
}

const MODEL_INTERNAL = new Set(["thinking", "redacted_thinking", "tool_use"]);

/**
 * After a mid-output server-side fallback, blocks produced before the last
 * `fallback` marker by the declined model must not be echoed back, except
 * text and paired server-tool blocks. See the Claude API refusal/fallback docs.
 * Returns content safe to append to history, plus the index from which
 * tool_use blocks belong to the model that actually answered.
 */
export function sanitizeAfterFallback<T extends { type: string }>(content: T[]): { content: T[]; liveFrom: number } {
  let boundary = -1;
  content.forEach((b, i) => {
    if (b.type === "fallback") boundary = i;
  });
  if (boundary < 0) return { content, liveFrom: 0 };

  const resultIds = new Set(
    content
      .map((b) => (b as unknown as Block).tool_use_id)
      .filter((id): id is string => typeof id === "string"),
  );
  const kept = content.filter((b, i) => {
    if (i >= boundary) return true;
    if (MODEL_INTERNAL.has(b.type)) return false;
    if (b.type === "server_tool_use") return resultIds.has((b as unknown as Block).id as string);
    return b.type === "text" || b.type.endsWith("_tool_result");
  });
  const liveFrom = kept.findIndex((b) => b.type === "fallback");
  return { content: kept, liveFrom };
}

/** Short title for a conversation from its first user message. */
export function titleFrom(text: string, max = 60): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line || "New conversation";
}
