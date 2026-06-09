import { useEffect, useState } from "react";
import { ELECTION } from "@/lib/mock";
import { cn } from "@/lib/utils";

function diff(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms / 3600000) % 24);
  const m = Math.floor((ms / 60000) % 60);
  const s = Math.floor((ms / 1000) % 60);
  return { d, h, m, s, ms };
}

export function TimerBanner({ label, target }: { label?: string; target?: Date }) {
  const t = target ?? ELECTION.votingStart;
  const isOpen =
    Date.now() >= ELECTION.votingStart.getTime() && Date.now() < ELECTION.votingEnd.getTime();
  const effectiveTarget = target ?? (isOpen ? ELECTION.votingEnd : ELECTION.votingStart);
  const effectiveLabel = label ?? (isOpen ? "Voting Closes In" : "Voting Opens In");
  const [now, setNow] = useState(() => diff(effectiveTarget));

  useEffect(() => {
    const i = setInterval(() => setNow(diff(effectiveTarget)), 1000);
    return () => clearInterval(i);
  }, [effectiveTarget]);

  const urgent = now && now.ms < 3600000;
  const cells = now
    ? [
        { v: now.d, l: "d" },
        { v: now.h, l: "h" },
        { v: now.m, l: "m" },
        { v: now.s, l: "s" },
      ]
    : null;

  return (
    <div
      className={cn(
        "rounded-2xl px-5 md:px-7 py-4 md:py-5 text-white shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
        urgent
          ? "bg-gradient-to-r from-red-600 to-red-500"
          : "bg-gradient-to-r from-[#1F3A6B] via-[#2E75B6] to-[#3E8FCF]",
      )}
    >
      <div>
        <p className="text-xs uppercase tracking-wider text-white/70">{effectiveLabel}</p>
        <p className="text-base md:text-lg font-semibold mt-0.5">{ELECTION.name}</p>
      </div>
      <div className="flex gap-2">
        {cells ? (
          cells.map((c, i) => (
            <div
              key={i}
              className="bg-white/15 backdrop-blur rounded-lg px-3 py-2 min-w-[58px] text-center"
            >
              <p className="text-xl md:text-2xl font-bold tabular-nums">
                {String(c.v).padStart(2, "0")}
              </p>
              <p className="text-[10px] uppercase text-white/70">{c.l}</p>
            </div>
          ))
        ) : (
          <span className="text-sm">Voting closed</span>
        )}
      </div>
    </div>
  );
}
