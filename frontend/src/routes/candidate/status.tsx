import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { label: "Application Submitted", time: "Oct 28, 2025 — 10:14 AM", state: "done" as const, note: "All 3 steps completed and payment verified." },
  { label: "Under Review", time: "Oct 29, 2025 — 02:30 PM", state: "done" as const, note: "Reviewed by Election Committee." },
  { label: "Approved", time: "Oct 30, 2025 — 09:00 AM", state: "active" as const, note: "Welcome to the candidate roster." },
];

function Page() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Application Status</h1>
        <p className="text-sm text-muted-foreground mt-1">Track every stage of your candidacy.</p>
      </div>
      <div className="bg-card rounded-2xl shadow-sm p-6">
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
    </div>
  );
}

export const Route = createFileRoute("/candidate/status")({ component: Page });
