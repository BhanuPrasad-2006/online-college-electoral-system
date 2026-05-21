import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, Sparkles, ShieldAlert, RotateCcw, Loader2,
  Bot, User, X, Minimize2, ChevronDown, MessageCircle,
} from "lucide-react";
import { getAuthToken } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────
type Msg = {
  from: "user" | "ai";
  text: string;
  isError?: boolean;
  timestamp: Date;
};

const API_BASE = "http://127.0.0.1:8000/api/v1/ai";

// ── Minimal Markdown renderer (no extra deps) ─────────────────────────────────
function renderMarkdown(raw: string): string {
  let html = raw
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  html = html.replace(/((?:\|[^\n]+\|\n?)+)/g, (table) => {
    const rows = table.trim().split("\n");
    if (rows.length < 2) return table;
    const headerCells = rows[0].split("|").filter(Boolean);
    const header = headerCells.map((c) => `<th>${c.trim()}</th>`).join("");
    const bodyRows = rows
      .slice(2)
      .map(
        (row) =>
          `<tr>${row
            .split("|")
            .filter(Boolean)
            .map((c) => `<td>${c.trim()}</td>`)
            .join("")}</tr>`
      )
      .join("");
    return `<div class="chat-table-wrap"><table class="chat-table"><thead><tr>${header}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  html = html.replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");

  return `<p>${html}</p>`;
}

// ── Suggestion chips ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  "Compare all candidates on Wi-Fi",
  "Who addresses placements?",
  "Top student concerns?",
  "Mental health support plans",
];

// ── Full-page embedded panel (for /voter/ai-assistant route) ──────────────────
export function AIAssistantPanel({ compact: _compact = false }: { compact?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([{
    from: "ai",
    text: "👋 Hi! I'm your **Election AI Assistant**.\n\nI can objectively compare candidates and explore manifestos — completely neutral.\n\nWhat would you like to know?",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setMsgs((p) => [...p, { from: "user", text: trimmed, timestamp: new Date() }]);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, message: trimmed }),
      });
      const data = await res.json();
      setSessionId(data.session_id);
      setMsgs((p) => [...p, { from: "ai", text: data.reply, timestamp: new Date() }]);
    } catch {
      setMsgs((p) => [...p, { from: "ai", text: "⚠️ Could not reach the AI. Is the backend running?", isError: true, timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  }, [loading, sessionId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Assistant</h1>
        <p className="text-sm text-muted-foreground mt-1">Neutral candidate research — Gemini 2.5 Flash</p>
      </div>
      <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-warning-foreground shrink-0" />
        <p className="text-xs">Strictly neutral — cannot recommend or rank candidates.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={loading}
            className="px-3 py-2 rounded-full bg-muted hover:bg-[#6C63FF]/10 hover:text-[#6C63FF] border border-border text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <Sparkles className="h-3 w-3 text-[#6C63FF]" /> {s}
          </button>
        ))}
      </div>
      <div className="bg-card rounded-2xl border border-border/60 shadow-sm flex flex-col" style={{ minHeight: "420px", maxHeight: "60vh" }}>
        <div ref={bottomRef as any} className="flex-1 overflow-y-auto p-4 space-y-3">
          <MessageList msgs={msgs} loading={loading} />
          <div ref={bottomRef} />
        </div>
        <ChatInput input={input} setInput={setInput} send={send} loading={loading} inputRef={inputRef} />
      </div>
    </div>
  );
}

// ── Floating chatbot widget ────────────────────────────────────────────────────
export function FloatingChatbot() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{
    from: "ai",
    text: "👋 Hi! I'm your **Election AI Assistant**.\n\nAsk me anything about candidates or their manifestos. I'm completely neutral!",
    timestamp: new Date(),
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>(SUGGESTIONS);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/chat/suggestions`)
      .then((r) => r.json())
      .then((d) => d?.suggestions?.length && setSuggestions(d.suggestions.slice(0, 4)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open || minimized) return;
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, [msgs, loading, open, minimized]);

  useEffect(() => {
    if (open && !minimized) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open, minimized]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setShowSuggestions(false);
    setMsgs((p) => [...p, { from: "user", text: trimmed, timestamp: new Date() }]);
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ session_id: sessionId, message: trimmed }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessionId(data.session_id);
      setMsgs((p) => [...p, { from: "ai", text: data.reply, timestamp: new Date() }]);
    } catch (e: any) {
      setMsgs((p) => [...p, {
        from: "ai",
        text: `⚠️ **Connection error**: ${e.message || "Could not reach the backend."}`,
        isError: true,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [loading, sessionId]);

  const clearChat = useCallback(() => {
    if (sessionId) fetch(`${API_BASE}/chat/${sessionId}`, { method: "DELETE" }).catch(() => {});
    setSessionId(null);
    setShowSuggestions(true);
    setMsgs([{
      from: "ai",
      text: "Chat cleared! 🔄 Ask me anything about the candidates or election.",
      timestamp: new Date(),
    }]);
  }, [sessionId]);

  const formatTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* ── Chat panel — sits above the FAB button ── */}
      {open && (
        <div
          className="fixed z-[9998] flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-black/30 border border-white/10 animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{
            bottom: "88px",
            right: "24px",
            width: "380px",
            maxWidth: "calc(100vw - 32px)",
            height: minimized ? "auto" : "min(560px, calc(100vh - 120px))",
            maxHeight: "calc(100vh - 120px)",
          }}
        >
          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-[#1a1a2e] via-[#1F3A6E] to-[#6C63FF] px-4 py-3 flex items-center gap-3 shrink-0">
            <div className="relative shrink-0">
              <div className="h-9 w-9 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
                <Bot className="h-5 w-5 text-white" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[#1F3A6E]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-tight">Election AI Assistant</p>
              <p className="text-white/60 text-[10px] flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                Online · Powered by Gemini 2.5 Flash
              </p>
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={clearChat}
                title="Clear chat"
                className="h-7 w-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/15 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setMinimized((m) => !m)}
                title={minimized ? "Expand" : "Minimize"}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/15 transition-colors"
              >
                {minimized
                  ? <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                  : <Minimize2 className="h-3.5 w-3.5" />
                }
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Close"
                className="h-7 w-7 flex items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/15 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {!minimized && (
            <>
              {/* ── Neutrality notice ── */}
              <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/50 dark:border-amber-800/30 px-3 py-1.5 flex items-center gap-2 shrink-0">
                <ShieldAlert className="h-3 w-3 text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400">
                  Neutral responses only · Based strictly on submitted manifestos
                </p>
              </div>

              {/* ── Messages ── */}
              <div
                ref={scrollAreaRef}
                className="flex-1 overflow-y-auto bg-[#F7F8FC] dark:bg-[#0F1724] overscroll-contain"
                style={{ minHeight: 0 }}
              >
                <div className="p-3 space-y-3">
                  {/* Suggestion chips */}
                  {showSuggestions && (
                    <div className="flex flex-wrap gap-1.5 pb-1">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => send(s)}
                          disabled={loading}
                          className="px-2.5 py-1.5 rounded-full bg-white dark:bg-white/5 border border-[#6C63FF]/25 text-[#6C63FF] text-[10px] font-medium hover:bg-[#6C63FF] hover:text-white hover:border-[#6C63FF] transition-all duration-150 disabled:opacity-40 shadow-sm flex items-center gap-1"
                        >
                          <Sparkles className="h-2.5 w-2.5" /> {s}
                        </button>
                      ))}
                    </div>
                  )}

                  <MessageList msgs={msgs} loading={loading} formatTime={formatTime} compact />
                  <div ref={bottomRef} className="h-1" />
                </div>
              </div>

              {/* ── Input bar ── */}
              <div className="bg-white dark:bg-[#0F1724] border-t border-gray-100 dark:border-white/10 p-3 flex gap-2 items-center shrink-0">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  placeholder="Ask about candidates..."
                  disabled={loading}
                  className="flex-1 h-9 px-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 focus:border-[#6C63FF]/60 disabled:opacity-50 transition-all"
                />
                <button
                  onClick={() => send(input)}
                  disabled={loading || !input.trim()}
                  className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#6C63FF] to-[#1F3A6E] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-30 transition-all shrink-0 shadow-md shadow-[#6C63FF]/30"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── FAB Toggle Button — always fixed bottom-right ── */}
      <button
        onClick={() => { setOpen((o) => !o); setMinimized(false); }}
        className="fixed bottom-6 right-6 z-[9999] h-14 w-14 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#1F3A6E] text-white shadow-lg shadow-[#6C63FF]/40 flex items-center justify-center transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-[#6C63FF]/50 active:scale-95 group"
        aria-label="Toggle AI Assistant"
        title="Election AI Assistant"
      >
        {/* Pulse ring */}
        <span className="absolute inset-0 rounded-full bg-[#6C63FF]/30 animate-ping" style={{ animationDuration: "2.5s" }} />
        {/* Online dot */}
        <span className="absolute top-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-emerald-400 border-2 border-white z-10 shadow-sm" />
        {/* Icon toggle */}
        <span className="relative z-10 transition-all duration-200">
          {open
            ? <X className="h-5 w-5" />
            : <MessageCircle className="h-6 w-6" />
          }
        </span>
      </button>

      {/* ── Inline styles ── */}
      <style>{`
        .inline-code {
          padding: 1px 5px;
          background: rgba(108, 99, 255, 0.12);
          border-radius: 4px;
          font-size: 11px;
          font-family: monospace;
          color: #6C63FF;
        }
        .chat-table-wrap {
          overflow-x: auto;
          margin: 6px 0;
          border-radius: 8px;
          border: 1px solid rgba(108,99,255,0.15);
        }
        .chat-table {
          width: 100%;
          font-size: 11px;
          border-collapse: collapse;
        }
        .chat-table thead tr { background: rgba(108,99,255,0.08); }
        .chat-table th, .chat-table td {
          padding: 6px 10px;
          text-align: left;
          border-bottom: 1px solid rgba(108,99,255,0.08);
        }
        .chat-table tr:last-child td { border-bottom: none; }
        .chat-bubble-ai p { margin: 0; }
        .chat-bubble-ai ul { margin: 4px 0; padding-left: 16px; list-style: disc; }
        .chat-bubble-ai li { margin: 2px 0; font-size: 12px; line-height: 1.5; }
        .chat-bubble-ai br { display: block; margin: 2px 0; }
      `}</style>
    </>
  );
}

// ── Shared message list ────────────────────────────────────────────────────────
function MessageList({
  msgs,
  loading,
  formatTime,
  compact = false,
}: {
  msgs: Msg[];
  loading: boolean;
  formatTime?: (d: Date) => string;
  compact?: boolean;
}) {
  const ft = formatTime ?? ((d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));

  return (
    <>
      {msgs.map((m, i) => (
        <div
          key={i}
          className={`flex gap-2 ${m.from === "user" ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-1 duration-200`}
        >
          {m.from === "ai" && (
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#6C63FF]/20 to-[#1F3A6E]/20 flex items-center justify-center shrink-0 mt-0.5 border border-[#6C63FF]/20">
              <Bot className="h-3.5 w-3.5 text-[#6C63FF]" />
            </div>
          )}
          <div className={`${compact ? "max-w-[85%]" : "max-w-[78%]"} flex flex-col ${m.from === "user" ? "items-end" : "items-start"} gap-0.5`}>
            <div
              className={`rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed
                ${m.from === "user"
                  ? "bg-gradient-to-br from-[#6C63FF] to-[#4F46E5] text-white rounded-br-sm shadow-md shadow-[#6C63FF]/25"
                  : m.isError
                    ? "bg-red-50 dark:bg-red-950/30 text-red-600 border border-red-200/50 rounded-bl-sm"
                    : "bg-white dark:bg-white/5 text-foreground border border-gray-100 dark:border-white/10 rounded-bl-sm shadow-sm"
                }`}
            >
              {m.from === "user" ? (
                <p className="break-words">{m.text}</p>
              ) : (
                <div
                  className="chat-bubble-ai break-words"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
                />
              )}
            </div>
            <span className="text-[10px] text-muted-foreground px-1">{ft(m.timestamp)}</span>
          </div>
          {m.from === "user" && (
            <div className="h-7 w-7 rounded-full bg-[#6C63FF]/10 dark:bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
              <User className="h-3.5 w-3.5 text-[#6C63FF] dark:text-white/70" />
            </div>
          )}
        </div>
      ))}

      {loading && (
        <div className="flex gap-2 justify-start animate-in fade-in duration-150">
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#6C63FF]/20 to-[#1F3A6E]/20 flex items-center justify-center shrink-0 border border-[#6C63FF]/20">
            <Bot className="h-3.5 w-3.5 text-[#6C63FF]" />
          </div>
          <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-[#6C63FF]"
                  style={{
                    animation: "bounce 0.8s infinite",
                    animationDelay: `${i * 150}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Chat input bar (used for full-page version) ────────────────────────────────
function ChatInput({
  input, setInput, send, loading, inputRef,
}: {
  input: string;
  setInput: (v: string) => void;
  send: (t: string) => void;
  loading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="border-t border-border p-3 flex gap-2 items-center bg-card rounded-b-2xl">
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
        placeholder="Ask about candidates or concerns..."
        disabled={loading}
        className="flex-1 h-10 px-3 rounded-xl border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 focus:border-[#6C63FF]/50 disabled:opacity-50 transition-all"
      />
      <button
        onClick={() => send(input)}
        disabled={loading || !input.trim()}
        className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#6C63FF] to-[#1F3A6E] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-30 transition-opacity shrink-0"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </button>
    </div>
  );
}
