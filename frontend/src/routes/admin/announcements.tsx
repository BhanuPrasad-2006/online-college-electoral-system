import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { createAnnouncement, fetchAnnouncements } from "@/lib/api";

function Page() {
  const [recipients, setRecipients] = useState("All Users");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchAnnouncements(20);
        setHistory(list);
      } catch {
        // ignore; user may not be admin yet
      }
    })();
  }, []);

  async function send() {
    if (!title.trim() || !body.trim()) return;
    setSending(true);
    try {
      const res = await createAnnouncement({ title, body, recipients });
      const a = res.announcement ?? null;
      if (a) {
        setHistory((h) => [a, ...h]);
      }
      setTitle("");
      setBody("");
      toast.success("Announcement sent");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send announcement");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Announcements</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Broadcast messages to voters and candidates.
        </p>
      </div>
      <div className="bg-card rounded-2xl shadow-sm p-6 space-y-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[#0F8A5F]" /> Compose
        </h2>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Send To</label>
          <Select value={recipients} onValueChange={setRecipients}>
            <SelectTrigger className="mt-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["All Users", "Voters Only", "Candidates Only"].map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1.5" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="mt-1.5 w-full h-32 p-3 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <Button
          className="bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90"
          disabled={sending}
          onClick={send}
        >
          {sending ? "Sending..." : "Send Announcement"}
        </Button>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-6">
        <h2 className="text-base font-semibold mb-4">Recent Announcements</h2>
        <div className="divide-y">
          {history.map((h) => (
            <div key={h.announcement_id ?? h.id} className="py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-sm">{h.title}</p>
                <span className="text-xs text-muted-foreground">
                  {h.created_at ? new Date(h.created_at).toLocaleString() : h.time}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">To: {h.recipients}</p>
              <p className="text-sm mt-2 text-muted-foreground">{h.body ?? h.preview}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/announcements")({ component: Page });
