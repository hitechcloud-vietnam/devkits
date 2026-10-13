import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAfterFallback, titleFrom, validateHistory } from "../src/lib/history.ts";

test("accepts a normal conversation ending with a user turn", () => {
  assert.equal(
    validateHistory([
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
      { role: "user", content: "next" },
    ]),
    null,
  );
});

test("rejects system roles, empty input and wrong ordering", () => {
  assert.match(validateHistory([])!, /non-empty/);
  assert.match(validateHistory([{ role: "system", content: "x" }])!, /roles/);
  assert.match(validateHistory([{ role: "assistant", content: "x" }, { role: "user", content: "y" }])!, /start/);
  assert.match(validateHistory([{ role: "user", content: "x" }, { role: "assistant", content: "y" }])!, /end/);
  assert.match(validateHistory([{ role: "user", content: "   " }])!, /empty/);
  assert.match(validateHistory([{ role: "user", content: [{ text: "no type" }] }])!, /block/);
});

test("rejects oversized histories", () => {
  const big = [{ role: "user", content: "a".repeat(4_100_000) }];
  assert.match(validateHistory(big)!, /too large/);
});

test("content without a fallback block is unchanged", () => {
  const content = [{ type: "thinking" }, { type: "text" }, { type: "tool_use", id: "t1" }];
  const r = sanitizeAfterFallback(content);
  assert.equal(r.content, content);
  assert.equal(r.liveFrom, 0);
});

test("drops declined-model internals before the last fallback marker", () => {
  const content = [
    { type: "thinking" },
    { type: "text", text: "partial" },
    { type: "tool_use", id: "dead" },
    { type: "server_tool_use", id: "s1" },
    { type: "web_search_tool_result", tool_use_id: "s1" },
    { type: "server_tool_use", id: "s2" },
    { type: "fallback" },
    { type: "thinking" },
    { type: "tool_use", id: "live" },
  ];
  const r = sanitizeAfterFallback(content);
  assert.deepEqual(
    r.content.map((b) => b.type),
    ["text", "server_tool_use", "web_search_tool_result", "fallback", "thinking", "tool_use"],
  );
  assert.equal(r.content[r.liveFrom].type, "fallback");
  assert.deepEqual(
    r.content.slice(r.liveFrom).filter((b) => b.type === "tool_use").map((b) => (b as { id?: string }).id),
    ["live"],
  );
});

test("titles are trimmed and shortened", () => {
  assert.equal(titleFrom("  Kiểm tra\n deployment  "), "Kiểm tra deployment");
  assert.equal(titleFrom("a".repeat(100)).length, 60);
  assert.equal(titleFrom("   "), "New conversation");
});
