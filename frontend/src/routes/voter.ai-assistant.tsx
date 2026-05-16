import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { sendAiMessage } from "@/lib/demo-api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Sparkles, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/voter/ai-assistant")({ component: Page });

const SUGGESTIONS = [
  "Which candidate focuses on hostel issues?",
  "Compare candidates on Wi-Fi",
  "Who has a placement improvement plan?",
];

type Msg = { from: "user" | "ai"; text: string; source?: string };

function Page() {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "ai", text: "Hi! I can help you compare candidates and explore manifestos. Ask me anything." }]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(text: string) {
    if (!text.trim() || sending) return;
    const userText = text.trim();
    setMsgs((m) => [...m, { from: "user", text: userText }]);
    setInput("");
    setSending(true);
    try {
      const { reply, source } = await sendAiMessage(userText);
      setMsgs((m) => [...m, { from: "ai", text: reply, source }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">AI Assistant</h1>
        <p className="text-sm text-muted-foreground mt-1">Neutral candidate research and comparison.</p>
      </div>

      <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-warning-foreground" />
        <p className="text-xs">This AI is strictly neutral and cannot recommend candidates. Demo mode uses local sample responses.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => send(s)} disabled={sending} className="px-3 py-2 rounded-full bg-muted hover:bg-muted/70 text-xs flex items-center gap-1.5 disabled:opacity-50">
            <Sparkles className="h-3 w-3 text-[#6C63FF]" /> {s}
          </button>
        ))}
      </div>

      <section className="bg-card rounded-2xl shadow-sm flex flex-col h-[520px]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.from === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.from === "user" ? "bg-[#1F3A6E] text-white rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"}`}>
                <p>{m.text}</p>
                {m.source && <p className="text-[11px] opacity-70 mt-2 italic">{m.source}</p>}
              </div>
            </div>
          ))}
          {sending && (
            <p className="text-xs text-muted-foreground animate-pulse">Thinking…</p>
          )}
        </div>
        <div className="border-t border-border p-3 flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask about candidates..." disabled={sending} />
          <Button onClick={() => send(input)} size="icon" disabled={sending} className="bg-[#1F3A6E] hover:bg-[#1F3A6E]/90"><Send className="h-4 w-4" /></Button>
        </div>
      </section>
    </div>
  );
}
