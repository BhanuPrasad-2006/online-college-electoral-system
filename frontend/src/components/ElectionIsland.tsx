import { useEffect, useState, useCallback } from "react";
import { Clock, UserPlus, Vote, Trophy, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchCurrentElection } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────
type Phase =
  | "pre_registration"  // before registration window
  | "registration_open" // registration window is open NOW
  | "between"           // registration done, voting not started
  | "voting_open"       // voting window is open NOW
  | "closed"            // voting ended, no results yet
  | "results";          // results published

interface ElectionData {
  title: string;
  status: string;
  registration_start?: string | null;
  registration_end?: string | null;
  voting_start?: string | null;
  voting_end?: string | null;
}

// ── Countdown formatter ────────────────────────────────────────
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

// ── Phase resolver — TIMESTAMPS WIN over DB status ─────────────
//  DB status is set manually by admin and may be stale.
//  We always compute phase from timestamps first.
function computePhase(election: ElectionData | null, now: number): {
  phase: Phase;
  target: number | null;
} {
  if (!election) return { phase: "pre_registration", target: null };

  const regStart = election.registration_start ? new Date(election.registration_start).getTime() : null;
  const regEnd   = election.registration_end   ? new Date(election.registration_end).getTime()   : null;
  const votStart = election.voting_start        ? new Date(election.voting_start).getTime()        : null;
  const votEnd   = election.voting_end          ? new Date(election.voting_end).getTime()          : null;

  // 1. Registration window active right now
  if (regStart && regEnd && now >= regStart && now < regEnd)
    return { phase: "registration_open", target: regEnd };

  // 2. Voting window active right now
  if (votStart && votEnd && now >= votStart && now < votEnd)
    return { phase: "voting_open", target: votEnd };

  // 3. Before registration opens
  if (regStart && now < regStart)
    return { phase: "pre_registration", target: regStart };

  // 4. Between registration close & voting open
  if (votStart && now < votStart)
    return { phase: "between", target: votStart };

  // 5. After everything — check DB status for results
  const status = (election.status || "").toUpperCase();
  if (status === "RESULTS_PUBLISHED")
    return { phase: "results", target: null };

  // 6. Everything over, results not published yet
  return { phase: "closed", target: null };
}

// ── Pill text per phase ────────────────────────────────────────
function buildPillText(phase: Phase, target: number | null, now: number): string {
  const remain = target ? Math.max(0, target - now) : 0;
  const cd = target ? fmtShort(remain) : "";

  switch (phase) {
    case "pre_registration":
      return target
        ? `📋 Registration opens in ${cd}`
        : "📋 Registration coming soon";

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

// ── Dot color per phase ────────────────────────────────────────
const DOT: Record<Phase, string> = {
  pre_registration:  "bg-blue-400",
  registration_open: "bg-[#6C63FF] animate-pulse",
  between:           "bg-amber-400",
  voting_open:       "bg-[#6C63FF] animate-pulse",
  closed:            "bg-gray-500",
  results:           "bg-amber-400",
};

const GLOW: Record<Phase, string> = {
  pre_registration:  "shadow-[0_2px_12px_rgba(59,130,246,0.2)]",
  registration_open: "shadow-[0_2px_18px_rgba(108,99,255,0.4)]",
  between:           "shadow-[0_2px_12px_rgba(251,191,36,0.2)]",
  voting_open:       "shadow-[0_2px_20px_rgba(108,99,255,0.45)]",
  closed:            "shadow-[0_2px_8px_rgba(0,0,0,0.3)]",
  results:           "shadow-[0_2px_14px_rgba(251,191,36,0.3)]",
};

// ── Component ─────────────────────────────────────────────────
export function ElectionIsland({
  floating = true,
  className,
}: {
  floating?: boolean;
  className?: string;
}) {
  const [election, setElection] = useState<ElectionData | null>(null);
  const [now, setNow] = useState(Date.now());

  // Re-fetch from backend every 15 seconds
  const load = useCallback(async () => {
    try {
      setElection(await fetchCurrentElection());
    } catch { /* keep last known */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const { phase, target } = computePhase(election, now);
  const urgent = (phase === "voting_open" || phase === "registration_open") &&
    target !== null && (target - now) < 3_600_000;

  const text = buildPillText(phase, target, now);

  return (
    <div
      className={cn(
        floating ? "fixed left-1/2 -translate-x-1/2 top-4 z-40 select-none" : "relative select-none",
        className,
        urgent && "animate-[pulse_1.2s_ease-in-out_infinite]"
      )}
    >
      <div
        className={cn("bg-[#0A0A0A] text-white flex items-center gap-2", GLOW[phase])}
        style={{ borderRadius: 999, padding: "7px 16px" }}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[phase])} />
        <Clock className="h-3.5 w-3.5 text-white/60 shrink-0" />
        <span className="text-[12px] font-medium tabular-nums whitespace-nowrap">
          {text}
        </span>
      </div>
    </div>
  );
}
