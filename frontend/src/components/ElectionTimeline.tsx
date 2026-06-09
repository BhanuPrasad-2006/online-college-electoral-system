import { useCurrentPhase, useElection } from "@/hooks/use-election-data";
import { CheckCircle2, Clock, ShieldAlert, Circle, UserCheck, Lock, Megaphone, Trophy, Vote } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stage {
  key: string;
  label: string;
  dates: string;
  status: "completed" | "current" | "upcoming";
}

export function ElectionTimeline() {
  const { data: phaseData } = useCurrentPhase();
  const { data: election } = useElection();

  const currentPhase = phaseData?.phase || "pre_registration";

  // Define phases order for comparison
  const phaseOrderMap: Record<string, number> = {
    pre_registration: 0,
    registration_open: 1,
    registration_closed: 2, // Verification / Approval
    campaign_period: 3,
    voting_open: 4,
    voting_closed: 5,
    results_announced: 6,
  };

  const getStageStatus = (stageNum: number): "completed" | "current" | "upcoming" => {
    const currentOrder = phaseOrderMap[currentPhase] ?? 0;
    
    if (stageNum < currentOrder) return "completed";
    if (stageNum === currentOrder) return "current";
    
    // For Verification & Approval, both map to registration_closed phase
    if (currentPhase === "registration_closed") {
      if (stageNum === 2) return "current"; // Verification
      if (stageNum === 3) return "upcoming"; // Approval will trigger after verification
    }

    return "upcoming";
  };

  const regStart = election?.registration_start ? new Date(election.registration_start) : null;
  const regEnd = election?.registration_end ? new Date(election.registration_end) : null;
  const docDeadline = election?.document_deadline ? new Date(election.document_deadline) : null;
  const voteStart = election?.voting_start ? new Date(election.voting_start) : null;
  const voteEnd = election?.voting_end ? new Date(election.voting_end) : null;
  const resultsPub = election?.results_published_at 
    ? new Date(election.results_published_at) 
    : (voteEnd ? new Date(voteEnd.getTime() + 2 * 24 * 60 * 60 * 1000) : null);

  const formatDateShort = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  const regLabel = regStart && regEnd
    ? `${formatDateShort(regStart)} - ${formatDateShort(regEnd)}`
    : "TBA";

  // Verification starts when registration ends
  let verLabel = "TBA";
  if (regEnd) {
    const endVer = docDeadline 
      ? new Date(regEnd.getTime() + (docDeadline.getTime() - regEnd.getTime()) / 2)
      : (voteStart ? new Date(regEnd.getTime() + (voteStart.getTime() - regEnd.getTime()) / 3) : new Date(regEnd.getTime() + 5 * 24 * 60 * 60 * 1000));
    verLabel = `${formatDateShort(regEnd)} - ${formatDateShort(endVer)}`;
  }

  // Approval runs from end of verification to docDeadline (or voting_start)
  let appLabel = "TBA";
  if (regEnd) {
    const startApp = docDeadline 
      ? new Date(regEnd.getTime() + (docDeadline.getTime() - regEnd.getTime()) / 2)
      : (voteStart ? new Date(regEnd.getTime() + (voteStart.getTime() - regEnd.getTime()) / 3) : new Date(regEnd.getTime() + 5 * 24 * 60 * 60 * 1000));
    const endApp = docDeadline || (voteStart ? new Date(voteStart.getTime() - 24 * 60 * 60 * 1000) : new Date(startApp.getTime() + 5 * 24 * 60 * 60 * 1000));
    appLabel = `${formatDateShort(startApp)} - ${formatDateShort(endApp)}`;
  }

  // Campaign runs from document_deadline to voting_start
  let campLabel = "TBA";
  if (docDeadline && voteStart) {
    campLabel = `${formatDateShort(docDeadline)} - ${formatDateShort(voteStart)}`;
  } else if (regEnd && voteStart) {
    campLabel = `${formatDateShort(regEnd)} - ${formatDateShort(voteStart)}`;
  }

  const voteLabel = voteStart && voteEnd
    ? `${formatDateShort(voteStart)} - ${formatDateShort(voteEnd)}`
    : voteStart
    ? formatDateShort(voteStart)
    : "TBA";

  const resLabel = resultsPub
    ? formatDateShort(resultsPub)
    : "TBA";

  const stages: Stage[] = [
    {
      key: "registration",
      label: "Registration",
      dates: regLabel,
      status: getStageStatus(1),
    },
    {
      key: "verification",
      label: "Verification",
      dates: verLabel,
      status: getStageStatus(2),
    },
    {
      key: "approval",
      label: "Candidate Approval",
      dates: appLabel,
      status: currentPhase === "registration_closed" ? "current" : getStageStatus(2), // shares same phase
    },
    {
      key: "campaign",
      label: "Campaign",
      dates: campLabel,
      status: getStageStatus(3),
    },
    {
      key: "voting",
      label: "Voting",
      dates: voteLabel,
      status: getStageStatus(4),
    },
    {
      key: "results",
      label: "Results",
      dates: resLabel,
      status: getStageStatus(6),
    },
  ];

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#E6ECE9] shadow-sm">
      <h3 className="text-sm font-bold text-[#102A27] mb-6">Election Progress</h3>

      {/* Horizontal timeline for desktop, vertical for mobile */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 md:gap-2 relative">
        {stages.map((stage, i) => {
          const isLast = i === stages.length - 1;
          const isCompleted = stage.status === "completed";
          const isCurrent = stage.status === "current";

          return (
            <div key={stage.key} className="flex-1 w-full md:w-auto flex flex-row md:flex-col items-center md:text-center group relative">
              
              {/* Stepper Line Connecting Circles */}
              {!isLast && (
                <div
                  className={cn(
                    "hidden md:block absolute top-[18px] left-[50%] right-[-50%] h-[2px] z-0 transition-colors duration-200",
                    isCompleted ? "bg-[#16A34A]" : "bg-[#E6ECE9]"
                  )}
                />
              )}
              {!isLast && (
                <div
                  className={cn(
                    "md:hidden absolute left-[17px] top-[36px] bottom-[-24px] w-[2px] z-0 transition-colors duration-200",
                    isCompleted ? "bg-[#16A34A]" : "bg-[#E6ECE9]"
                  )}
                />
              )}

              {/* Icon Circle */}
              <div
                className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 z-10 transition-all duration-200 border-2",
                  isCompleted
                    ? "bg-[#16A34A] border-[#16A34A] text-white shadow-sm shadow-[#16A34A]/25"
                    : isCurrent
                    ? "bg-[#0F8A5F] border-[#0F8A5F] text-white shadow-md shadow-[#0F8A5F]/20 animate-pulse-subtle"
                    : "bg-white border-[#E6ECE9] text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-white" />
                ) : isCurrent ? (
                  stage.key === "campaign" ? (
                    <Megaphone className="h-4.5 w-4.5 text-white" />
                  ) : stage.key === "voting" ? (
                    <Vote className="h-4.5 w-4.5 text-white" />
                  ) : (
                    <Clock className="h-4.5 w-4.5 text-white" />
                  )
                ) : stage.key === "results" ? (
                  <Trophy className="h-4 w-4 text-muted-foreground/60" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                )}
              </div>

              {/* Labels & Dates */}
              <div className="ml-4 md:ml-0 md:mt-3 text-left md:text-center min-w-0">
                <p
                  className={cn(
                    "text-xs font-bold leading-tight transition-colors",
                    isCurrent ? "text-[#0F8A5F]" : isCompleted ? "text-[#102A27]" : "text-muted-foreground"
                  )}
                >
                  {stage.label}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 whitespace-nowrap">{stage.dates}</p>
                {isCurrent && (
                  <span className="inline-flex mt-1 md:mt-1.5 px-2 py-0.5 rounded-full bg-[#0F8A5F]/10 text-[9px] font-bold text-[#0F8A5F] tracking-wide uppercase leading-none">
                    In Progress
                  </span>
                )}
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
