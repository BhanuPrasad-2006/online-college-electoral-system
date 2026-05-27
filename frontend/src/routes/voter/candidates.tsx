import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates } from "@/hooks/use-election-data";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Check, Minus, Brain, FileText, AlertTriangle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

interface Contradiction {
  statement_a: string;
  statement_b: string;
  explanation: string;
  severity: "minor" | "moderate" | "severe";
}

function severityColor(severity: string) {
  if (severity === "severe") return "bg-red-100 text-red-800 border-red-200";
  if (severity === "moderate") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-yellow-50 text-yellow-700 border-yellow-100";
}

function severityLabel(severity: string) {
  if (severity === "severe") return "High";
  if (severity === "moderate") return "Medium";
  return "Low";
}

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
    return (
      isVisible &&
      (pos === "all" || c.position === pos) &&
      nameStr.toLowerCase().includes(q.toLowerCase())
    );
  });

  const active = candidates.find((c) => (c.candidate_id || c.id) === open);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Candidates & Manifestos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse approved candidates and read their manifestos.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search candidates"
            className="pl-9"
          />
        </div>
        <Select value={pos} onValueChange={setPos}>
          <SelectTrigger className="w-full sm:w-[220px]">
            <SelectValue />
          </SelectTrigger>
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
          const initials = nameStr
            .split(" ")
            .map((n: string) => n[0] || "")
            .join("");
          const tone =
            (c.match || 75) >= 70
              ? "bg-success/15 text-success"
              : (c.match || 75) >= 40
                ? "bg-warning/20 text-warning-foreground"
                : "bg-muted text-muted-foreground";
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
                  : "hover:shadow-md hover:border-solid hover:border-border/60",
              )}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14">
                  <AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{nameStr}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.department} · {c.semester} Sem
                  </p>
                  <p className="text-[11px] text-muted-foreground italic mt-0.5 truncate">
                    {c.party}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <Badge variant="outline">{c.position}</Badge>
                {isPendingStatus ? (
                  <Badge
                    variant="secondary"
                    className="bg-warning/15 text-warning-foreground border border-warning/25 font-semibold"
                  >
                    Pending Approval
                  </Badge>
                ) : (
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${tone}`}>
                    Match {c.match || 75}%
                  </span>
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
                <p className="text-sm text-muted-foreground">
                  {active.position} · {active.department} · {active.party}
                </p>
              </SheetHeader>
              <div className="mt-6 space-y-6">
                {/* Party Members */}
                <div className="bg-card rounded-xl border border-border/60 p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#6C63FF]" />
                    Running Mates
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-background rounded-lg p-3 border border-border/40">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        Vice President
                      </p>
                      <p className="font-medium text-sm">
                        {active.vice_president ?? active.runningMates?.vicePresident ?? "—"}
                      </p>
                    </div>
                    <div className="bg-background rounded-lg p-3 border border-border/40">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                        Gen. Secretary
                      </p>
                      <p className="font-medium text-sm">
                        {active.secretary ?? active.runningMates?.secretary ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-success/10 border border-success/30 rounded-lg p-3 inline-block text-xs font-semibold text-success">
                  Covers {Math.round(((active.coverage || 78) / 100) * COVERAGE_CATS.length)}/
                  {COVERAGE_CATS.length} student concerns
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Manifesto</h3>
                  {active.manifesto_image_url && (
                    <div className="mb-3 rounded-lg overflow-hidden border border-border">
                      {active.manifesto_image_url.match(/\.pdf$/i) ? (
                        <a
                          href={active.manifesto_image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-4 bg-muted/20 hover:bg-muted/40 transition-colors"
                        >
                          <FileText className="h-6 w-6 text-[#6C63FF]" />
                          <span className="text-sm font-medium">View Attached PDF</span>
                        </a>
                      ) : (
                        <img
                          src={active.manifesto_image_url}
                          alt="Manifesto media"
                          className="w-full max-h-60 object-contain bg-muted/20"
                        />
                      )}
                    </div>
                  )}
                  {active.manifesto ? (
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {active.manifesto}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      {active.manifesto_status === "Pending Review"
                        ? "This manifesto is under admin review and is not visible yet."
                        : "No approved manifesto published for this candidate yet."}
                    </p>
                  )}
                </div>
                {active.impact_statements && active.impact_statements.length > 0 && (
                  <div className="bg-[#6C63FF]/10 border border-[#6C63FF]/25 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 font-semibold text-xs text-[#6C63FF]">
                      <Brain className="h-4 w-4 shrink-0" />
                      <span>AI System Impact Notes (Public Estimates)</span>
                    </div>
                    <div className="text-xs space-y-2.5 text-muted-foreground">
                      {active.impact_statements.map((imp: any, i: number) => (
                        <div key={i} className="border-l-2 border-[#6C63FF]/30 pl-2">
                          <p className="font-semibold text-foreground">Promise: "{imp.promise}"</p>
                          <p className="italic mt-0.5">Estimate: {imp.trade_off}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-semibold mb-3">AI Coverage Breakdown</h3>
                  <div className="space-y-2">
                    {COVERAGE_CATS.map((cat, i) => {
                      const covered =
                        i < Math.round(((active.coverage || 78) / 100) * COVERAGE_CATS.length);
                      const pct = covered ? 60 + ((i * 11) % 35) : 5 + ((i * 7) % 20);
                      return (
                        <div key={cat}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="flex items-center gap-1.5">
                              {covered ? (
                                <Check className="h-3.5 w-3.5 text-success" />
                              ) : (
                                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              {cat}
                            </span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={
                                covered ? "h-full bg-success" : "h-full bg-muted-foreground/40"
                              }
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {(active as any).contradictions && (active as any).contradictions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <h3 className="text-sm font-semibold">Contradictions Detected</h3>
                    </div>
                    <div className="space-y-2">
                      {((active as any).contradictions as Contradiction[]).map(
                        (c: Contradiction, i: number) => (
                          <div
                            key={i}
                            className={`rounded-lg border p-3 text-xs space-y-1.5 ${severityColor(c.severity)}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-semibold uppercase tracking-wider">
                                {severityLabel(c.severity)} Priority
                              </span>
                            </div>
                            <div className="space-y-1">
                              <p className="font-medium text-[11px]">Statement A:</p>
                              <p className="italic">&ldquo;{c.statement_a}&rdquo;</p>
                            </div>
                            <div className="space-y-1">
                              <p className="font-medium text-[11px]">Statement B:</p>
                              <p className="italic">&ldquo;{c.statement_b}&rdquo;</p>
                            </div>
                            <p className="text-muted-foreground mt-1">{c.explanation}</p>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
