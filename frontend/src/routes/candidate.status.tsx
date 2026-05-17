import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, FileText, Film, Image as ImageIcon, MessageSquare, Clock, XCircle } from "lucide-react";
import { MEDIA_ITEMS, type MediaItem } from "@/lib/mock";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STAGES = [
  { label: "Manifesto Submitted", time: "Oct 28, 2025 — 10:14 AM", state: "done" as const, note: "Your manifesto draft was submitted for review." },
  { label: "Under Review by Election Committee", time: "Oct 29, 2025 — 02:30 PM", state: "done" as const, note: "Reviewers are checking content guidelines and policy compliance." },
  { label: "Approved & Published to Voters", time: "Oct 30, 2025 — 09:00 AM", state: "active" as const, note: "Once approved, voters will see your manifesto in the Campaign Gallery." },
];

function statusTone(s: MediaItem["status"]) {
  if (s === "Approved") return "bg-success text-white";
  if (s === "Rejected") return "bg-destructive text-white";
  return "bg-warning text-warning-foreground";
}

function typeIcon(t: MediaItem["type"]) {
  if (t === "video") return Film;
  if (t === "poster") return ImageIcon;
  if (t === "message") return MessageSquare;
  return FileText;
}

function Page() {
  // For demo, treat the first candidate's submissions as "yours"
  const mine = MEDIA_ITEMS.slice(0, 4);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Manifesto Approval Status</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Track the review and approval of your manifesto, videos, posters and messages.
        </p>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold mb-4">Approval Pipeline</h2>
        <ol className="relative border-l-2 border-border ml-3">
          {STAGES.map((s, i) => {
            const done = s.state === "done";
            const active = s.state === "active";
            return (
              <li key={i} className="ml-6 pb-8 last:pb-0">
                <span className={cn(
                  "absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-background",
                  done ? "bg-success text-white" : active ? "bg-[#1F3A6E] text-white animate-pulse" : "bg-muted text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                </span>
                <h3 className={cn("font-semibold", active && "text-[#1F3A6E]")}>{s.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{s.time}</p>
                <p className="text-sm mt-2">{s.note}</p>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold mb-4">Your Submissions</h2>
        <div className="space-y-3">
          {mine.map((m) => {
            const Icon = typeIcon(m.type);
            return (
              <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/40 transition-colors">
                <span className="h-10 w-10 rounded-xl bg-[#6C63FF]/10 text-[#6C63FF] flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{m.title}</p>
                    <Badge variant="outline" className="capitalize text-[10px]">{m.type}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Submitted {m.submittedAt || "recently"}
                  </p>
                  {m.status === "Rejected" && (
                    <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                      <XCircle className="h-3 w-3" /> Did not meet content guidelines. Please revise and resubmit.
                    </p>
                  )}
                </div>
                <Badge className={statusTone(m.status)}>{m.status}</Badge>
              </div>
            );
          })}
          {mine.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/status")({ component: Page });
