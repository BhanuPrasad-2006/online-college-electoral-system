import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageLoader } from "@/components/PageLoader";
import { useCandidateProfile } from "@/hooks/use-election-data";

function Page() {
  const { data: profile, isPending } = useCandidateProfile();

  if (isPending || !profile) return <PageLoader />;

  const statusUpper = (profile.status || "PENDING").toUpperCase();
  const isApproved = statusUpper === "APPROVED";
  const isRejected = statusUpper === "REJECTED";
  const isUnderReview = statusUpper === "UNDER REVIEW" || statusUpper === "UNDER_REVIEW";

  const stages = [
    { 
      label: "Application Submitted", 
      time: profile.applied_at ? new Date(profile.applied_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : "—", 
      state: "done" as const, 
      note: "All registration steps completed and submitted successfully." 
    },
    { 
      label: "Under Review", 
      time: (isUnderReview || isApproved || isRejected) ? "Evaluation Initiated" : "Awaiting Evaluation", 
      state: (isApproved || isRejected) ? "done" as const : isUnderReview ? "active" as const : "pending" as const, 
      note: isUnderReview 
        ? "Your application is currently being evaluated by the Election Committee." 
        : (isApproved || isRejected)
        ? "Reviewed by Election Committee."
        : "Awaiting evaluation by the Election Committee."
    },
    { 
      label: isRejected ? "Rejected" : isApproved ? "Approved" : "Decision", 
      time: (isApproved || isRejected) ? "Decision Finalized" : "Decision Pending", 
      state: (isApproved || isRejected) ? "done" as const : "pending" as const, 
      note: isApproved 
        ? "Congratulations! Your candidacy has been approved. Welcome to the official candidate roster." 
        : isRejected 
        ? `Application Rejected. Reason: ${profile.admin_remarks || "No comments provided."}` 
        : "Evaluation results will be published here once finalized."
    },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Application Status</h1>
        <p className="text-sm text-muted-foreground mt-1">Track every stage of your candidacy in real time.</p>
      </div>
      <div className="bg-card rounded-2xl shadow-sm p-6">
        <ol className="relative border-l-2 border-border ml-3">
          {stages.map((s, i) => {
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
                <h3 className={cn("font-semibold", active && "text-[#1F3A6E]", done && "text-success")}>{s.label}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{s.time}</p>
                <p className="text-sm mt-2 text-foreground/80">{s.note}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/status")({ component: Page });
