"use client";

import { ArrowUp, ChevronRight, CircleAlert, Check, Copy, LoaderCircle, RotateCw, SquarePen, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useAccount } from "@/components/session-context";
import { AppShell } from "@/components/ui/AppShell";
import { Button, cn } from "@/components/ui/primitives";
import Markdown from "@/components/user/Markdown";
import { titleFrom, type HistoryMessage } from "@/lib/history";
import { USER_NAV } from "@/lib/nav";

// ---------- Types ----------

type ToolPart = { kind: "tool"; id: string; name: string; server: boolean; input?: unknown; status: "running" | "ok" | "error"; summary?: string };
type Part = { kind: "text"; text: string } | { kind: "thinking"; text: string } | ToolPart | { kind: "notice"; text: string };

type AssistantStatus = "streaming" | "done" | "stopped" | "error";

interface ViewMessage {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  status?: AssistantStatus;
  error?: string;
  /** api history length when this answer was requested (for regenerate). */
  apiStart?: number;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  /** Exact API history, echoed back to the server on every turn. */
  api: HistoryMessage[];
  view: ViewMessage[];
}

type ServerEvent =
  | { type: "text"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: string; input?: unknown; server: boolean }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "fallback"; from: string; to: string }
  | { type: "messages"; messages: HistoryMessage[] }
  | { type: "done"; stopReason: string | null; model: string; usage: { input: number; output: number } }
  | { type: "error"; message: string; retryable: boolean };

// ---------- Local persistence (per-browser convenience only) ----------

const STORAGE_KEY = "devkits.conversations.v2";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as Conversation[]) : [];
    // An answer cannot still be streaming after a reload.
    return list.map((c) => ({ ...c, view: c.view.map((m) => (m.status === "streaming" ? { ...m, status: "stopped" as const } : m)) }));
  } catch {
    return [];
  }
}

function saveConversations(list: Conversation[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

const uid = () => crypto.randomUUID();

const TOOL_LABELS: Record<string, string> = {
  github_repo_overview: "Xem thông tin repo GitHub",
  github_list_commits: "Liệt kê commit gần đây",
  github_list_pull_requests: "Liệt kê pull request",
  github_read_path: "Đọc file trên GitHub",
  vercel_project_info: "Đọc cấu hình project Vercel",
  vercel_list_deployments: "Liệt kê deployment",
  vercel_build_log: "Đọc build log",
  web_search: "Tìm kiếm web",
};
const toolLabel = (name: string) => TOOL_LABELS[name] ?? name;

const STARTERS = ["Dựng module thanh toán VNPay cho WHMCS", "Rà soát bảo mật module HostBill đang có", "Chuyển module WHMCS này sang HostBill"];

// ---------- SSE parsing ----------

async function* readEvents(res: Response): AsyncGenerator<ServerEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (data) yield JSON.parse(data) as ServerEvent;
    }
  }
}

/** Applies one streamed event to the assistant message being built. */
function applyEvent(parts: Part[], ev: ServerEvent): Part[] {
  const next = [...parts];
  const last = next[next.length - 1];
  switch (ev.type) {
    case "text":
      if (last?.kind === "text") next[next.length - 1] = { ...last, text: last.text + ev.text };
      else next.push({ kind: "text", text: ev.text });
      break;
    case "thinking":
      if (last?.kind === "thinking") next[next.length - 1] = { ...last, text: last.text + ev.text };
      else next.push({ kind: "thinking", text: ev.text });
      break;
    case "tool_call": {
      const i = next.findIndex((p) => p.kind === "tool" && p.id === ev.id);
      if (i >= 0) next[i] = { ...(next[i] as ToolPart), input: ev.input ?? (next[i] as ToolPart).input };
      else next.push({ kind: "tool", id: ev.id, name: ev.name, server: ev.server, input: ev.input, status: "running" });
      break;
    }
    case "tool_result": {
      const i = next.findIndex((p) => p.kind === "tool" && p.id === ev.id);
      if (i >= 0) next[i] = { ...(next[i] as ToolPart), status: ev.ok ? "ok" : "error", summary: ev.summary };
      break;
    }
    case "fallback":
      next.push({ kind: "notice", text: `Mô hình ${ev.from} từ chối; ${ev.to} trả lời tiếp.` });
      break;
  }
  return next;
}

// ---------- Pieces ----------

function ToolSteps({ tools, streaming }: { tools: ToolPart[]; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const running = tools.find((t) => t.status === "running");
  const errors = tools.filter((t) => t.status === "error").length;
  let label: string;
  if (running && !open) label = `${toolLabel(running.name)}`;
  else if (running) label = `Đang dùng ${tools.length} công cụ`;
  else label = `Đã dùng ${tools.length} công cụ${errors ? `, ${errors} lỗi` : ""}`;
  const showSpin = Boolean(running) && !open;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-md text-sm text-muted outline-hidden hover:text-foreground"
      >
        <ChevronRight className={cn("size-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-90")} aria-hidden />
        <span className="min-w-0 truncate">{label}</span>
        {showSpin && streaming && <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")} inert={!open}>
        <div className="min-h-0 overflow-hidden">
          <ul className="mt-2 ml-[7px] space-y-3 border-l border-border-strong pl-5">
            {tools.map((t) => (
              <li key={t.id} className="flex gap-2">
                {t.status === "running" ? (
                  <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-muted motion-reduce:animate-none" aria-hidden />
                ) : t.status === "error" ? (
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-400" aria-hidden />
                ) : (
                  <Check className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{toolLabel(t.name)}</p>
                  {t.summary && <p className="text-xs text-muted [overflow-wrap:anywhere]">{t.summary}</p>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AnswerActions({ text, isLast, stopped, onRegenerate }: { text: string; isLast: boolean; stopped: boolean; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false);
  const iconBtn = "inline-flex size-8 items-center justify-center rounded-lg text-muted outline-hidden hover:bg-foreground/5 hover:text-foreground";
  return (
    // -ml-2 bù px của nút: icon đầu thẳng cột chữ câu trả lời; hàng nằm giữa cột chữ nên không bớt padding được (N11)
    <div className={cn("-ml-2 flex items-center gap-1", !isLast && "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100")}>
      <button
        type="button"
        aria-label="Sao chép"
        title="Sao chép"
        className={iconBtn}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </button>
      {isLast && (
        <button type="button" aria-label="Tạo lại" title="Tạo lại" className={iconBtn} onClick={onRegenerate}>
          <RotateCw className="size-4" aria-hidden />
        </button>
      )}
      {stopped && <span className="ml-1 text-xs text-muted">Đã dừng giữa chừng</span>}
    </div>
  );
}

function AssistantMessage({ m, isLast, onRetry }: { m: ViewMessage; isLast: boolean; onRetry: () => void }) {
  const tools = m.parts.filter((p): p is ToolPart => p.kind === "tool");
  const text = m.parts
    .filter((p): p is Extract<Part, { kind: "text" }> => p.kind === "text")
    .map((p) => p.text)
    .join("");
  const notices = m.parts.filter((p): p is Extract<Part, { kind: "notice" }> => p.kind === "notice");
  const streaming = m.status === "streaming";
  return (
    <div className="group max-w-[55ch] space-y-3">
      {tools.length > 0 && <ToolSteps tools={tools} streaming={streaming} />}
      {streaming && tools.length === 0 && !text && (
        <p className="flex h-8 items-center gap-2 text-sm text-muted">
          <LoaderCircle className="size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
          Đang soạn câu trả lời
        </p>
      )}
      {notices.map((n, i) => (
        <p key={i} className="text-sm text-muted">
          {n.text}
        </p>
      ))}
      {text && (
        <Markdown
          text={text}
          cursor={streaming ? <span className="inline-block h-[1.1em] w-2 rounded-sm bg-foreground/30 align-text-bottom" aria-hidden /> : undefined}
        />
      )}
      {m.status === "error" && (
        <div role="alert">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Trợ lý chưa trả lời được</p>
          {m.error && <p className="mt-1 text-sm text-muted">{m.error}</p>}
          {isLast && (
            <div className="mt-3">
              <Button icon={RotateCw} onClick={onRetry}>
                Thử lại
              </Button>
            </div>
          )}
        </div>
      )}
      {(m.status === "done" || m.status === "stopped") && text && <AnswerActions text={text} isLast={isLast} stopped={m.status === "stopped"} onRegenerate={onRetry} />}
    </div>
  );
}

const suggestionClass =
  "block w-fit max-w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-left text-sm text-foreground outline-hidden hover:bg-button-hover";

// ---------- Component ----------

export default function Chat() {
  const account = useAccount();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageFailed, setStorageFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const list = loadConversations();
    setConversations(list);
    setActiveId(list[0]?.id ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) setStorageFailed(!saveConversations(conversations));
  }, [conversations, loaded]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  useEffect(() => {
    const el = threadRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 240) el.scrollTop = el.scrollHeight;
  }, [active?.view]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [input]);

  const update = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  /** Streams one answer for `history` (which ends with a user message) into conversation `convId`. */
  const stream = useCallback(
    async (convId: string, history: HistoryMessage[]) => {
      const assistantId = uid();
      update(convId, (c) => ({ ...c, updatedAt: Date.now(), view: [...c.view, { id: assistantId, role: "assistant", parts: [], status: "streaming", apiStart: history.length }] }));
      const patch = (fn: (m: ViewMessage) => ViewMessage) => update(convId, (c) => ({ ...c, view: c.view.map((m) => (m.id === assistantId ? fn(m) : m)) }));

      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      let finalStatus: AssistantStatus = "done";
      let errorText: string | undefined;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `Máy chủ trả lỗi ${res.status}.`);
        }
        for await (const ev of readEvents(res)) {
          if (ev.type === "messages") update(convId, (c) => ({ ...c, api: [...c.api, ...ev.messages] }));
          else if (ev.type === "error") {
            finalStatus = "error";
            errorText = ev.message;
          } else if (ev.type !== "done") patch((m) => ({ ...m, parts: applyEvent(m.parts, ev) }));
        }
      } catch (err) {
        if (controller.signal.aborted) finalStatus = "stopped";
        else {
          finalStatus = "error";
          errorText = err instanceof Error ? err.message : "Không kết nối được máy chủ.";
        }
      } finally {
        patch((m) => ({
          ...m,
          status: finalStatus,
          error: errorText,
          parts: m.parts.map((p) => (p.kind === "tool" && p.status === "running" ? { ...p, status: "error", summary: "Không hoàn tất" } : p)),
        }));
        abortRef.current = null;
        setBusy(false);
        textareaRef.current?.focus();
      }
    },
    [update],
  );

  function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    let conv = active;
    if (!conv) {
      conv = { id: uid(), title: titleFrom(content), updatedAt: Date.now(), api: [], view: [] };
      const created = conv;
      setConversations((list) => [created, ...list]);
      setActiveId(created.id);
    }
    const history: HistoryMessage[] = [...conv.api, { role: "user", content }];
    update(conv.id, (c) => ({
      ...c,
      title: c.view.length ? c.title : titleFrom(content),
      api: history,
      view: [...c.view, { id: uid(), role: "user", parts: [{ kind: "text", text: content }] }],
    }));
    setInput("");
    void stream(conv.id, history);
  }

  /** Re-runs the last answer from the history as it was when that answer was requested. */
  function regenerate() {
    if (!active || busy) return;
    const last = active.view[active.view.length - 1];
    if (last?.role !== "assistant") return;
    const history = active.api.slice(0, last.apiStart ?? active.api.length);
    if (!history.length || history[history.length - 1].role !== "user") return;
    update(active.id, (c) => ({ ...c, api: history, view: c.view.slice(0, -1) }));
    void stream(active.id, history);
  }

  function newConversation() {
    if (busy) abortRef.current?.abort();
    setActiveId(null);
    setInput("");
    textareaRef.current?.focus();
  }

  function deleteConversation(id: string) {
    if (busy && id === activeId) abortRef.current?.abort();
    setConversations((list) => list.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  const sidebarTop = (
    <div className="mb-3">
      <Button icon={SquarePen} className="w-full" onClick={newConversation}>
        Cuộc trò chuyện mới
      </Button>
    </div>
  );

  const sidebarBottom = (
    <div className="mt-4">
      <p className="flex h-10 items-center px-3 text-xs font-medium tracking-wide text-muted uppercase">Gần đây</p>
      {!loaded ? null : conversations.length === 0 ? (
        <p className="px-3 py-2 text-sm text-pretty text-muted">Chưa có cuộc trò chuyện nào</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {conversations.map((c) => {
            const on = c.id === activeId;
            return (
              <li key={c.id} className={cn("group/conv flex items-center rounded-xl", on ? "bg-secondary" : "hover:bg-item-hover")}>
                <button
                  type="button"
                  title={c.title}
                  aria-current={on ? "page" : undefined}
                  onClick={() => setActiveId(c.id)}
                  className={cn("flex h-10 min-w-0 flex-1 items-center px-3 text-left text-sm outline-hidden", on ? "font-medium text-foreground" : "text-foreground/70 hover:text-foreground")}
                >
                  <span className="min-w-0 truncate">{c.title}</span>
                </button>
                <button
                  type="button"
                  aria-label={`Xoá cuộc trò chuyện "${c.title}"`}
                  title="Xoá"
                  onClick={() => deleteConversation(c.id)}
                  className="mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted opacity-0 outline-hidden group-hover/conv:opacity-100 group-focus-within/conv:opacity-100 hover:bg-rose-500/10 hover:text-rose-700 [@media(hover:none)]:opacity-100 dark:hover:text-rose-400"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const view = active?.view ?? [];
  const isEmpty = view.length === 0;

  return (
    <AppShell
      portal="user"
      nav={USER_NAV}
      activeHref="/"
      account={account}
      title={active && !isEmpty ? active.title : "Cuộc trò chuyện mới"}
      sidebarTop={sidebarTop}
      sidebarBottom={sidebarBottom}
      fixed
    >
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {!isEmpty && (
              <ol className="space-y-8">
                {view.map((m, i) =>
                  m.role === "user" ? (
                    <li key={m.id}>
                      <p className="ml-auto w-fit max-w-[85%] rounded-3xl bg-surface px-4 py-2.5 text-base whitespace-pre-wrap [overflow-wrap:anywhere] sm:max-w-[80%]">
                        {m.parts.map((p) => (p.kind === "text" ? p.text : "")).join("")}
                      </p>
                    </li>
                  ) : (
                    <li key={m.id}>
                      <AssistantMessage m={m} isLast={i === view.length - 1} onRetry={regenerate} />
                    </li>
                  ),
                )}
              </ol>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4">
          <div className="mx-auto w-full max-w-3xl">
            {isEmpty && loaded && (
              <div className="mb-3 space-y-2">
                <p className="text-sm text-muted">Thử hỏi</p>
                {STARTERS.map((s) => (
                  <button key={s} type="button" className={suggestionClass} onClick={() => send(s)} disabled={busy}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {storageFailed && <p className="mb-2 text-xs text-amber-700 dark:text-orange-400">Không lưu được lịch sử vào trình duyệt này. Cuộc trò chuyện vẫn dùng được trong phiên hiện tại.</p>}
            <form
              className="flex items-end gap-2 rounded-3xl border border-border-strong bg-surface p-2 focus-within:border-focus focus-within:ring-2 focus-within:ring-focus"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <label htmlFor="composer" className="sr-only">
                Tin nhắn
              </label>
              <textarea
                id="composer"
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                className="max-h-60 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-base outline-hidden placeholder:text-muted"
                placeholder="Giao việc hoặc đặt câu hỏi"
              />
              {busy ? (
                <button
                  type="button"
                  aria-label="Dừng trả lời"
                  title="Dừng trả lời"
                  onClick={() => abortRef.current?.abort()}
                  className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground outline-hidden hover:bg-primary-hover"
                >
                  <Square className="size-3.5 fill-current" aria-hidden />
                </button>
              ) : (
                <button
                  type="submit"
                  aria-label="Gửi"
                  title="Gửi"
                  disabled={!input.trim()}
                  className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground outline-hidden hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <ArrowUp className="size-4" aria-hidden />
                </button>
              )}
            </form>
            <p className="mt-2 text-center text-xs text-muted">Trợ lý chỉ đọc GitHub, Vercel và web. Thay đổi nào cũng là đề xuất để bạn thực hiện.</p>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
