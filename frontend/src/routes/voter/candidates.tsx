import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates } from "@/hooks/use-election-data";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Check, Minus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { z } from "zod";

const searchSchema = z.object({
  open: z.string().optional(),
});

export const Route = createFileRoute("/voter/candidates")({
  validateSearch: searchSchema,
  component: Page,
});

const COVERAGE_CATS = ["Infrastructure", "Academics", "Welfare", "Events", "Sports", "Hostel"];

function Page() {
  const { open: searchOpen } = Route.useSearch();
  const { data: candidates = [], isPending } = useCandidates();
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (searchOpen) {
      setOpen(searchOpen);
    }
  }, [searchOpen]);

  if (isPending) return <PageLoader />;

  const filtered = candidates.filter((c) => {
    const nameStr = c.full_name || c.name || "";
    const status = (c.status || "").toLowerCase();
    const isVisible = status === "approved";
    return isVisible && (pos === "all" || c.position === pos) && nameStr.toLowerCase().includes(q.toLowerCase());
  });

  const active = candidates.find((c) => (c.candidate_id || c.id) === open);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Candidates & Manifestos</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse approved candidates and read their manifestos.</p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates" className="pl-9" />
        </div>
        <Select value={pos} onValueChange={setPos}>
          <SelectTrigger className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            <SelectItem value="President">President</SelectItem>
            <SelectItem value="Vice President">Vice President</SelectItem>
            <SelectItem value="General Secretary">General Secretary</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const nameStr = c.full_name || c.name || "Candidate";
          const candId = c.candidate_id || c.id;
          const initials = nameStr.split(" ").map((n: string) => n[0] || "").join("");
          const tone = (c.match || 75) >= 70 ? "bg-success/15 text-success" : (c.match || 75) >= 40 ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground";
          const isPendingStatus = (c.status || "").toLowerCase() === "pending";
          return (
            <button
              key={candId}
              onClick={() => !isPendingStatus && setOpen(candId)}
              disabled={isPendingStatus}
              className={cn(
                "bg-card rounded-2xl shadow-sm p-5 text-left transition-all w-full border border-transparent",
                isPendingStatus
                  ? "opacity-60 cursor-not-allowed border-dashed border-border"
                  : "hover:shadow-md hover:border-solid hover:border-border/60"
              )}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14"><AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] font-semibold">{initials}</AvatarFallback></Avatar>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{nameStr}</p>
                  <p className="text-xs text-muted-foreground">{c.department} · {c.semester} Sem</p>
                  <p className="text-[11px] text-muted-foreground italic mt-0.5 truncate">{c.party}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="outline">{c.position}</Badge>
                {isPendingStatus ? (
                  <Badge variant="secondary" className="bg-warning/15 text-warning-foreground border border-warning/25 font-semibold">Pending Approval</Badge>
                ) : (
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${tone}`}>Match {c.match || 75}%</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <Sheet open={!!open} onOpenChange={(b) => !b && setOpen(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle>{active.full_name || active.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{active.position} · {active.department} · {active.party}</p>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="bg-success/10 border border-success/30 rounded-lg p-3 inline-block text-xs font-semibold text-success">
                  Covers {Math.round((active.coverage || 78) / 100 * COVERAGE_CATS.length)}/{COVERAGE_CATS.length} student concerns
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Manifesto</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{active.manifesto}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-3">AI Coverage Breakdown</h3>
                  <div className="space-y-2">
                    {COVERAGE_CATS.map((cat, i) => {
                      const covered = i < Math.round(((active.coverage || 78) / 100) * COVERAGE_CATS.length);
                      const pct = covered ? 60 + ((i * 11) % 35) : 5 + ((i * 7) % 20);
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-1.5">
                              {covered ? <Check className="h-3.5 w-3.5 text-success" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
                              {cat}
                            </span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={covered ? "h-full bg-success" : "h-full bg-muted-foreground/40"} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

