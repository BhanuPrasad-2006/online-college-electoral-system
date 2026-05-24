import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useElection } from "@/hooks/use-election-data";

// ── Types ──────────────────────────────────────────────────────
type Phase =
  | "pre_registration"
  | "registration_open"
  | "between"
  | "voting_open"
  | "closed"
  | "results";

interface ElectionData {
  title?: string;
  name?: string;
  status: string;
  registration_start?: string | null;
  registration_end?: string | null;
  voting_start?: string | null;
  voting_end?: string | null;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmtShort(ms: number): string {
  const t = Math.max(0, ms);
  const d = Math.floor(t / 86_400_000);
  const h = Math.floor((t / 3_600_000) % 24);
  const m = Math.floor((t / 60_000) % 60);
  const s = Math.floor((t / 1_000) % 60);
  if (d > 0) return `${pad(d)}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  if (h > 0) return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}m ${pad(s)}s`;
}

function computePhase(election: ElectionData | null, now: number): {
  phase: Phase;
  target: number | null;
} {
  if (!election) return { phase: "pre_registration", target: null };

  const regStart = election.registration_start
    ? new Date(election.registration_start).getTime()
    : null;
  const regEnd = election.registration_end
    ? new Date(election.registration_end).getTime()
    : null;
  const votStart = election.voting_start
    ? new Date(election.voting_start).getTime()
    : null;
  const votEnd = election.voting_end
    ? new Date(election.voting_end).getTime()
    : null;

  if (regStart && regEnd && now >= regStart && now < regEnd)
    return { phase: "registration_open", target: regEnd };
  if (votStart && votEnd && now >= votStart && now < votEnd)
    return { phase: "voting_open", target: votEnd };
  if (regStart && now < regStart)
    return { phase: "pre_registration", target: regStart };
  if (votStart && now < votStart)
    return { phase: "between", target: votStart };

  const status = (election.status || "").toUpperCase();
  if (status === "RESULTS_PUBLISHED") return { phase: "results", target: null };

  return { phase: "closed", target: null };
}

function buildPillText(phase: Phase, target: number | null, now: number): string {
  const remain = target ? Math.max(0, target - now) : 0;
  const cd = target ? fmtShort(remain) : "";

  switch (phase) {
    case "pre_registration":
      return target ? `📋 Registration opens in ${cd}` : "📋 Registration coming soon";
    case "registration_open":
      return `🟢 Reg. open! Interested? Register · closes in ${cd}`;
    case "between":
      return `⏳ Registration closed · Voting opens in ${cd}`;
    case "voting_open":
      return `🗳️ Voting is LIVE! · closes in ${cd}`;
    case "closed":
      return "🔒 Voting ended · Results pending";
    case "results":
      return "🏆 Results are live!";
  }
}

const DOT: Record<Phase, string> = {
  pre_registration: "bg-blue-400",
  registration_open: "bg-[#6C63FF] animate-pulse",
  between: "bg-amber-400",
  voting_open: "bg-[#6C63FF] animate-pulse",
  closed: "bg-gray-500",
  results: "bg-amber-400",
};

const GLOW: Record<Phase, string> = {
  pre_registration: "shadow-[0_2px_12px_rgba(59,130,246,0.2)]",
  registration_open: "shadow-[0_2px_18px_rgba(108,99,255,0.4)]",
  between: "shadow-[0_2px_12px_rgba(251,191,36,0.2)]",
  voting_open: "shadow-[0_2px_20px_rgba(108,99,255,0.45)]",
  closed: "shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
  results: "shadow-[0_2px_14px_rgba(251,191,36,0.3)]",
};

export function ElectionIsland({
  floating = true,
  className,
}: {
  floating?: boolean;
  className?: string;
}) {
  const { data: electionRaw } = useElection();
  const [now, setNow] = useState(Date.now());

  const election: ElectionData | null = electionRaw
    ? {
        title: (electionRaw as any).name ?? (electionRaw as any).title,
        name: (electionRaw as any).name,
        status: (electionRaw as any).status ?? "",
        registration_start: (electionRaw as any).registration_start ?? null,
        registration_end: (electionRaw as any).registration_end ?? null,
        voting_start: (electionRaw as any).voting_start ?? (electionRaw as any).votingStart?.toISOString?.() ?? null,
        voting_end: (electionRaw as any).voting_end ?? (electionRaw as any).votingEnd?.toISOString?.() ?? null,
      }
    : null;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const { phase, target } = computePhase(election, now);
  const urgent =
    (phase === "voting_open" || phase === "registration_open") &&
    target !== null &&
    target - now < 3_600_000;

  const text = buildPillText(phase, target, now);

  return (
    <div
      className={cn(
        floating
          ? "fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-[95vw]"
          : "w-full",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium",
          "bg-card/90 backdrop-blur-md border border-border/60",
          GLOW[phase],
          urgent && "ring-2 ring-[#6C63FF]/40",
        )}
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", DOT[phase])} />
        <span className="truncate">{text}</span>
      </div>
    </div>
  );
}
