import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CANDIDATES } from "@/lib/mock";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Check, Minus } from "lucide-react";


export const Route = createFileRoute("/voter/candidates")({ component: Page });

const COVERAGE_CATS = ["Infrastructure", "Academics", "Welfare", "Events", "Sports", "Hostel"];

function Page() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const presidents = CANDIDATES.filter((c) => c.position === "President");
  const filtered = presidents.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const active = presidents.find((c) => c.id === open);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Candidates & Manifestos</h1>
        <p className="text-sm text-muted-foreground mt-1">Browse approved presidential candidates and read their manifestos.</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search candidates" className="pl-9" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const initials = c.name.split(" ").map((n) => n[0]).join("");
          const tone = c.match >= 70 ? "bg-success/15 text-success" : c.match >= 40 ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground";
          return (
            <button key={c.id} onClick={() => setOpen(c.id)} className="bg-card rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-shadow">
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 ring-2 ring-[#6C63FF]/30">
                  <AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.department} · {c.semester} Sem</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40">
                <span className="text-2xl leading-none">{c.symbol ?? "🎓"}</span>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Party</p>
                  <p className="text-xs font-medium truncate">{c.party}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground line-clamp-3 leading-relaxed">{c.manifesto}</p>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="outline">{c.position}</Badge>
                <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${tone}`}>Match {c.match}%</span>
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
                <SheetTitle className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 ring-2 ring-[#6C63FF]/30">
                    <AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] font-semibold">
                      {active.name.split(" ").map((n) => n[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <span>{active.name}</span>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40">
                  <span className="text-2xl leading-none">{active.symbol ?? "🎓"}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Party</p>
                    <p className="text-sm font-medium truncate">{active.party}</p>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Manifesto</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{active.manifesto}</p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-3">AI Coverage Breakdown</h3>
                  <div className="space-y-2">
                    {COVERAGE_CATS.map((cat, i) => {
                      const covered = i < Math.round((active.coverage / 100) * COVERAGE_CATS.length);
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
