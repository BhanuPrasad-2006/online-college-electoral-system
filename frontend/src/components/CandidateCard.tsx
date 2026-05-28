import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Candidate } from "@/lib/mock";
import { cn } from "@/lib/utils";

export function CandidateCard({
  c,
  onView,
  selected,
  onSelect,
  showSelect,
}: {
  c: Candidate;
  onView?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  showSelect?: boolean;
}) {
  const initials = c.name
    .split(" ")
    .map((n) => n[0])
    .join("");
  return (
    <div
      className={cn(
        "group interactive-card bg-card rounded-2xl border p-5 flex flex-col items-center text-center",
        selected
          ? "ring-2 ring-[#6C63FF] border-[#6C63FF] shadow-lg shadow-[#6C63FF]/15 scale-[1.02]"
          : "border-border/60 hover:border-[#6C63FF]/30",
      )}
    >
      <Avatar className="h-20 w-20 mb-3 ring-2 ring-[#6C63FF]/20 transition-transform group-hover:scale-105">
        <AvatarFallback className="bg-gradient-to-br from-[#6C63FF]/15 to-[#1F3A6E]/15 text-[#6C63FF] text-xl font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <h3 className="font-semibold text-foreground">{c.name}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        {c.semester} Sem · {c.department}
      </p>
      <p className="text-[11px] text-muted-foreground mt-0.5 italic">{c.party}</p>
      <Badge variant="outline" className="mt-3 text-[11px]">
        {c.position}
      </Badge>
      {showSelect ? (
        <button
          onClick={onSelect}
          className={cn(
            "mt-4 w-full py-2 rounded-lg text-sm font-medium border transition-colors",
            selected
              ? "bg-[#6C63FF] text-white border-[#6C63FF]"
              : "bg-background border-border hover:bg-muted",
          )}
        >
          {selected ? "● Selected" : "○ Select"}
        </button>
      ) : (
        <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onView}>
          View Manifesto
        </Button>
      )}
    </div>
  );
}
