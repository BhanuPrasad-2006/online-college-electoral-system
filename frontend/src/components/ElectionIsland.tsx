import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { ELECTION } from "@/lib/mock";
import { cn } from "@/lib/utils";

type Phase = "pre" | "active" | "post";

function phaseOf(): { phase: Phase; target: Date | null; label: string } {
  const t = Date.now();
  if (t < ELECTION.votingStart.getTime()) return { phase: "pre", target: ELECTION.votingStart, label: "Voting opens in" };
  if (t < ELECTION.votingEnd.getTime()) return { phase: "active", target: ELECTION.votingEnd, label: "Voting closes in" };
  return { phase: "post", target: null, label: "Voting closed" };
}

function fmt(ms: number) {
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms / 3600000) % 24);
  const m = Math.floor((ms / 60000) % 60);
  const s = Math.floor((ms / 1000) % 60);
  return { d, h, m, s };
}

export function ElectionIsland({
  floating = true,
  className,
}: {
  floating?: boolean;
  className?: string;
}) {
  const [{ phase, target, label }, setState] = useState(phaseOf);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
      setState(phaseOf());
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const remain = target ? Math.max(0, target.getTime() - now) : 0;
  const t = fmt(remain);
  const urgent = phase === "active" && remain < 60 * 60 * 1000;

  const dotClass =
    phase === "pre" ? "bg-blue-500" : phase === "active" ? "bg-green-500" : "bg-gray-400";
  const glow =
    phase === "active"
      ? "shadow-[0_4px_32px_rgba(34,197,94,0.4)]"
      : phase === "post"
        ? "shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
        : "shadow-[0_4px_24px_rgba(0,0,0,0.35)]";

  const collapsedShort =
    phase === "pre"
      ? `Voting opens in ${String(t.d).padStart(2, "0")}d ${String(t.h).padStart(2, "0")}h ${String(t.m).padStart(2, "0")}m`
      : phase === "active"
        ? `Voting closes in ${String(t.d).padStart(2, "0")}d ${String(t.h).padStart(2, "0")}h ${String(t.m).padStart(2, "0")}m`
        : "Voting closed";

  return (
    <div
      className={cn(
        floating
          ? "fixed left-1/2 -translate-x-1/2 top-4 z-40 select-none"
          : "relative select-none",
        className,
        urgent && "animate-pulse"
      )}
      style={{ transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onClick={() => setExpanded((v) => !v)}
    >
      <div
        className={cn(
          "bg-[#0A0A0A] text-white flex flex-col items-center justify-center cursor-pointer",
          glow
        )}
        style={{
          borderRadius: 999,
          padding: expanded ? "10px 24px" : "9px 20px",
          minWidth: expanded ? 340 : 260,
          maxWidth: 420,
          transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      >
        {!expanded ? (
          <div className="flex items-center gap-2.5">
            <span className={cn("h-2 w-2 rounded-full", dotClass)} />
            <Clock className="h-4 w-4 text-white/80" />
            <span className="text-[13px] font-medium tabular-nums whitespace-nowrap">
              {collapsedShort}
            </span>
          </div>
        ) : (
          <div className="w-full text-center">
            <p className="text-[10px] tracking-[0.18em] text-white/60 uppercase">
              Student Council Election 2025
            </p>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className={cn("h-2 w-2 rounded-full", dotClass)} />
              <span className="text-[12px] text-white/70">{label}</span>
            </div>
            {phase !== "post" ? (
              <div className="flex items-center justify-center gap-1.5 mt-1.5 text-[20px] font-semibold tabular-nums">
                <Cell n={t.d} unit="d" />
                <span className="opacity-50">:</span>
                <Cell n={t.h} unit="h" />
                <span className="opacity-50">:</span>
                <Cell n={t.m} unit="m" />
                <span className="opacity-50">:</span>
                <Cell n={t.s} unit="s" />
              </div>
            ) : (
              <p className="text-sm font-medium mt-1">3 hours ago</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Cell({ n, unit }: { n: number; unit: string }) {
  return (
    <span className="inline-flex items-baseline">
      <span className="tabular-nums">{String(n).padStart(2, "0")}</span>
      <span className="text-[10px] text-white/50 ml-0.5">{unit}</span>
    </span>
  );
}
