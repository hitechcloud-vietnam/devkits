"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Markdown from "@/components/Markdown";
import { titleFrom, type HistoryMessage } from "@/lib/history";

// ---------- Types ----------

type Part =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "tool"; id: string; name: string; server: boolean; input?: unknown; status: "running" | "ok" | "error"; summary?: string }
  | { kind: "notice"; tone: "error" | "info"; text: string };

interface ViewMessage {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
  meta?: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: number;
  /** Exact API history, echoed back to the server on every turn. */
  api: HistoryMessage[];
  view: ViewMessage[];
}

interface HealthCheck {
  id: string;
  label: string;
  status: "connected" | "configured" | "not_configured" | "error";
  detail: string;
  checkedAt: string;
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

const STORAGE_KEY = "devkits.conversations.v1";

function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Conversation[]) : [];
  } catch {
    return [];
  }
}

function saveConversations(list: Conversation[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return null;
  } catch {
    return "Không lưu được lịch sử vào trình duyệt (bộ nhớ đầy hoặc bị chặn). Cuộc trò chuyện vẫn dùng được trong phiên này.";
  }
}

const uid = () => crypto.randomUUID();

const TOOL_LABELS: Record<string, string> = {
  github_repo_overview: "GitHub · thông tin repo",
  github_list_commits: "GitHub · commit gần đây",
  github_list_pull_requests: "GitHub · pull request",
  github_read_path: "GitHub · đọc file",
  vercel_project_info: "Vercel · cấu hình project",
  vercel_list_deployments: "Vercel · deployments",
  vercel_build_log: "Vercel · build log",
  web_search: "Tìm kiếm web",
};

const STATUS_LABELS: Record<HealthCheck["status"], string> = {
  connected: "Đã kết nối (kiểm tra trực tiếp)",
  configured: "Đã cấu hình",
  not_configured: "Chưa cấu hình",
  error: "Lỗi",
};

const SUGGESTIONS = [
  { title: "Kiểm tra deployment", prompt: "Kiểm tra tình trạng các deployment gần nhất của DevKits trên Vercel và cho biết có lỗi gì không." },
  { title: "Tóm tắt repo", prompt: "Tóm tắt trạng thái hiện tại của repo hitechcloud-vietnam/devkits: commit gần đây, PR đang mở và cấu trúc thư mục." },
  { title: "Cấu hình domain", prompt: "Lập checklist các bước để gắn domain devkits.hitechcloud.vn vào project Vercel, gồm bản ghi DNS cần tạo và cách kiểm tra." },
  { title: "Soạn tài liệu", prompt: "Tôi cần soạn một tài liệu. Hãy hỏi tôi những thông tin cần thiết trước khi bắt đầu." },
];

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
      if (i >= 0) next[i] = { ...(next[i] as Extract<Part, { kind: "tool" }>), input: ev.input ?? (next[i] as { input?: unknown }).input };
      else next.push({ kind: "tool", id: ev.id, name: ev.name, server: ev.server, input: ev.input, status: "running" });
      break;
    }
    case "tool_result": {
      const i = next.findIndex((p) => p.kind === "tool" && p.id === ev.id);
      if (i >= 0) next[i] = { ...(next[i] as Extract<Part, { kind: "tool" }>), status: ev.ok ? "ok" : "error", summary: ev.summary };
      break;
    }
    case "fallback":
      next.push({ kind: "notice", tone: "info", text: `Mô hình ${ev.from} từ chối; ${ev.to} tiếp tục trả lời.` });
      break;
    case "error":
      next.push({ kind: "notice", tone: "error", text: ev.message });
      break;
  }
  return next;
}

// ---------- Component ----------

export default function Workspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthCheck[] | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    const list = loadConversations();
    setConversations(list);
    setActiveId(list[0]?.id ?? null);
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (loaded.current) setStorageWarning(saveConversations(conversations));
  }, [conversations]);

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  useEffect(() => {
    const el = threadRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 200) el.scrollTop = el.scrollHeight;
  }, [active?.view]);

  const refreshHealth = useCallback(async () => {
    setHealthBusy(true);
    setHealthError(null);
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setHealth(((await res.json()) as { checks: HealthCheck[] }).checks);
    } catch (err) {
      setHealthError(`Không kiểm tra được: ${err instanceof Error ? err.message : "lỗi"}`);
    } finally {
      setHealthBusy(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const update = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((list) => list.map((c) => (c.id === id ? fn(c) : c)));
  }, []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    let conv = active;
    if (!conv) {
      conv = { id: uid(), title: titleFrom(content), updatedAt: Date.now(), api: [], view: [] };
      const created = conv;
      setConversations((list) => [created, ...list]);
      setActiveId(created.id);
    }
    const convId = conv.id;
    const userMsg: HistoryMessage = { role: "user", content };
    const assistantId = uid();
    const history = [...conv.api, userMsg];

    update(convId, (c) => ({
      ...c,
      title: c.view.length ? c.title : titleFrom(content),
      updatedAt: Date.now(),
      api: history,
      view: [...c.view, { id: uid(), role: "user", parts: [{ kind: "text", text: content }] }, { id: assistantId, role: "assistant", parts: [] }],
    }));
    setInput("");
    setBusy(true);

    const patchAssistant = (fn: (m: ViewMessage) => ViewMessage) =>
      update(convId, (c) => ({ ...c, view: c.view.map((m) => (m.id === assistantId ? fn(m) : m)) }));

    const controller = new AbortController();
    abortRef.current = controller;
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
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      for await (const ev of readEvents(res)) {
        if (ev.type === "messages") {
          update(convId, (c) => ({ ...c, api: [...c.api, ...ev.messages], updatedAt: Date.now() }));
        } else if (ev.type === "done") {
          const meta = `${ev.model} · ${ev.usage.input.toLocaleString()} in / ${ev.usage.output.toLocaleString()} out tokens`;
          patchAssistant((m) => ({ ...m, meta }));
        } else {
          patchAssistant((m) => ({ ...m, parts: applyEvent(m.parts, ev) }));
        }
      }
    } catch (err) {
      const aborted = controller.signal.aborted;
      patchAssistant((m) => ({
        ...m,
        parts: [
          ...m.parts,
          aborted
            ? { kind: "notice", tone: "info", text: "Đã dừng." }
            : { kind: "notice", tone: "error", text: err instanceof Error ? err.message : "Lỗi không xác định" },
        ],
      }));
    } finally {
      // Any tool still marked running did not complete.
      patchAssistant((m) => ({
        ...m,
        parts: m.parts.map((p) => (p.kind === "tool" && p.status === "running" ? { ...p, status: "error", summary: "Không hoàn tất" } : p)),
      }));
      abortRef.current = null;
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function newConversation() {
    setActiveId(null);
    setSidebarOpen(false);
    textareaRef.current?.focus();
  }

  function deleteConversation(id: string) {
    setConversations((list) => list.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 240)}px`;
  }, [input]);

  const lastAssistant = active?.view[active.view.length - 1];
  const runningTool =
    busy && lastAssistant?.role === "assistant"
      ? (lastAssistant.parts.findLast((p) => p.kind === "tool" && p.status === "running") as Extract<Part, { kind: "tool" }> | undefined)
      : undefined;

  return (
    <div className="app">
      <div className={`overlay ${sidebarOpen || panelOpen ? "open" : ""}`} onClick={() => (setSidebarOpen(false), setPanelOpen(false))} />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Cuộc trò chuyện">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            DK
          </div>
          <div>
            DevKits
            <small>HiTechCloud AI Workspace</small>
          </div>
        </div>
        <div style={{ padding: "0 16px 8px" }}>
          <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={newConversation}>
            + Cuộc trò chuyện mới
          </button>
        </div>
        <ul className="conv-list">
          {conversations.map((c) => (
            <li key={c.id} className={`conv-item ${c.id === activeId ? "active" : ""}`}>
              <button className="open" title={c.title} onClick={() => (setActiveId(c.id), setSidebarOpen(false))}>
                {c.title}
              </button>
              <button className="btn btn-ghost icon-btn del" aria-label={`Xoá "${c.title}"`} onClick={() => deleteConversation(c.id)} disabled={busy && c.id === activeId}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-foot">
          <span>Lịch sử lưu trên trình duyệt này</span>
          <button className="btn btn-ghost" onClick={logout}>
            Đăng xuất
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="btn" onClick={() => setSidebarOpen(true)} aria-label="Mở danh sách hội thoại">
            ☰
          </button>
          <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{active?.title ?? "DevKits"}</strong>
          <button className="btn" onClick={() => setPanelOpen(true)}>
            Trạng thái
          </button>
        </div>

        <div className="thread" ref={threadRef}>
          <div className="thread-inner">
            {!active || active.view.length === 0 ? (
              <div className="empty">
                <h1>Bạn cần làm gì hôm nay?</h1>
                <p>Mô tả mục tiêu bằng ngôn ngữ tự nhiên. AI sẽ hỏi thêm khi cần, tra cứu GitHub/Vercel/web ở chế độ chỉ đọc, và đề xuất các bước thay đổi để bạn duyệt.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s.title} className="suggestion" onClick={() => void send(s.prompt)} disabled={busy}>
                      <strong>{s.title}</strong>
                      <span>{s.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              active.view.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="msg-user">
                    {m.parts.map((p) => (p.kind === "text" ? p.text : "")).join("")}
                  </div>
                ) : (
                  <div key={m.id} className="msg-assistant">
                    {m.parts.map((p, i) => (
                      <PartView key={i} part={p} />
                    ))}
                    {m.meta && <div className="msg-meta">{m.meta}</div>}
                  </div>
                ),
              )
            )}
            {busy && (
              <div className="status-line" role="status" aria-live="polite">
                <span className="dot running" />
                {runningTool ? `Đang gọi ${TOOL_LABELS[runningTool.name] ?? runningTool.name}…` : "Đang xử lý…"}
              </div>
            )}
          </div>
        </div>

        <div className="composer">
          {storageWarning && (
            <div className="notice info" style={{ maxWidth: 780, margin: "0 auto 8px" }}>
              {storageWarning}
            </div>
          )}
          <div className="composer-box">
            <textarea
              ref={textareaRef}
              rows={1}
              placeholder="Nhập yêu cầu, ngữ cảnh hoặc câu trả lời…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Tin nhắn"
            />
            <div className="composer-row">
              <span className="composer-hint">Enter để gửi · Shift+Enter xuống dòng</span>
              {busy ? (
                <button className="btn" onClick={() => abortRef.current?.abort()}>
                  Dừng
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => void send(input)} disabled={!input.trim()}>
                  Gửi
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

      <aside className={`panel ${panelOpen ? "open" : ""}`} aria-label="Trạng thái workspace">
        <section>
          <h2>
            Kết nối
            <button className="btn btn-ghost" onClick={() => void refreshHealth()} disabled={healthBusy}>
              {healthBusy ? "Đang kiểm tra…" : "Kiểm tra lại"}
            </button>
          </h2>
          {healthError && <div className="notice error">{healthError}</div>}
          {!health && !healthError && <div className="status-line">Đang kiểm tra kết nối thật…</div>}
          {health?.map((c) => (
            <div className="check" key={c.id}>
              <span className={`dot ${c.status}`} aria-hidden />
              <div>
                <strong>{c.label}</strong>
                <span>{c.detail}</span>
                <div className="st">
                  {STATUS_LABELS[c.status]} ·{" "}
                  {new Date(c.checkedAt).toLocaleTimeString("vi-VN")}
                </div>
              </div>
            </div>
          ))}
        </section>
        <section>
          <h2>AI có thể</h2>
          <ul className="cap-list">
            <li>Trao đổi, hỏi làm rõ và lập kế hoạch cho mọi loại công việc</li>
            <li>Đọc repo GitHub: commit, PR, file, thư mục</li>
            <li>Đọc Vercel: project, deployments, domain, build log</li>
            <li>Tìm kiếm web và dẫn nguồn</li>
            <li>Soạn thảo tài liệu, code, checklist</li>
          </ul>
        </section>
        <section>
          <h2>Cần bạn phê duyệt</h2>
          <div className="callout">
            Mọi công cụ hiện ở chế độ <strong>chỉ đọc</strong>. Thay đổi như deploy production, sửa DNS, đổi biến môi trường hay merge code chỉ được AI <em>đề xuất</em> kèm các bước cụ thể. AI không tự thực hiện và sẽ không báo hoàn thành nếu không có bằng chứng.
          </div>
        </section>
      </aside>
    </div>
  );
}

function PartView({ part }: { part: Part }) {
  switch (part.kind) {
    case "text":
      return <Markdown text={part.text} />;
    case "thinking":
      return part.text.trim() ? (
        <details className="thinking">
          <summary>Tóm tắt suy luận</summary>
          <div>{part.text}</div>
        </details>
      ) : null;
    case "tool":
      return (
        <details className="tool">
          <summary>
            <span className={`dot ${part.status}`} aria-hidden />
            <span>{TOOL_LABELS[part.name] ?? part.name}</span>
            <span className="tag">{part.server ? "máy chủ Anthropic" : "chỉ đọc"}</span>
            <span className="sum">{part.status === "running" ? "đang chạy…" : part.summary}</span>
          </summary>
          <pre>
            {part.name}
            {part.input !== undefined ? `\n${JSON.stringify(part.input, null, 2)}` : ""}
            {part.summary ? `\n→ ${part.summary}` : ""}
          </pre>
        </details>
      );
    case "notice":
      return <div className={`notice ${part.tone}`}>{part.text}</div>;
  }
}
