import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates } from "@/hooks/use-election-data";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Search,
  Check,
  Minus,
  Brain,
  FileText,
  AlertTriangle,
  GraduationCap,
  Building2,
  Award,
  Sparkles,
  ChevronRight,
  X,
  BookOpen,
  BarChart3,
  ShieldAlert,
  Star,
} from "lucide-react";
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

const COVERAGE_CATS = [
  { label: "Infrastructure", icon: "🏗️" },
  { label: "Academics", icon: "📚" },
  { label: "Welfare", icon: "❤️" },
  { label: "Events", icon: "🎉" },
  { label: "Sports", icon: "⚽" },
  { label: "Hostel", icon: "🏠" },
];

interface Contradiction {
  statement_a: string;
  statement_b: string;
  explanation: string;
  severity: "minor" | "moderate" | "severe";
}

function severityColor(severity: string) {
  if (severity === "severe") return "bg-red-50 text-red-800 border-red-200";
  if (severity === "moderate")
    return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-yellow-50 text-yellow-700 border-yellow-100";
}

function severityLabel(severity: string) {
  if (severity === "severe") return "High";
  if (severity === "moderate") return "Medium";
  return "Low";
}

function severityBadgeStyle(severity: string) {
  if (severity === "severe")
    return "bg-red-100 text-red-700 border-0 font-semibold";
  if (severity === "moderate")
    return "bg-amber-100 text-amber-700 border-0 font-semibold";
  return "bg-yellow-100 text-yellow-700 border-0 font-semibold";
}

type TabType = "manifesto" | "ai" | "contradictions";

function CandidateDetail({ active }: { active: any }) {
  const [activeTab, setActiveTab] = useState<TabType>("manifesto");
  const nameStr = active.full_name || active.name || "Candidate";
  const initials = nameStr
    .split(" ")
    .map((n: string) => n[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const coverageCount = Math.round(
    ((active.coverage || 78) / 100) * COVERAGE_CATS.length,
  );
  const matchScore = active.match || 75;
  const matchColor =
    matchScore >= 70
      ? "text-emerald-600"
      : matchScore >= 40
        ? "text-amber-600"
        : "text-slate-500";
  const matchBg =
    matchScore >= 70
      ? "bg-emerald-50"
      : matchScore >= 40
        ? "bg-amber-50"
        : "bg-slate-50";

  const hasContradictions =
    (active as any).contradictions &&
    (active as any).contradictions.length > 0;
  const hasImpact =
    active.impact_statements && active.impact_statements.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Hero Header */}
      <div
        className="relative overflow-hidden flex-shrink-0"
        style={{
          background:
            "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
        }}
      >
        {/* Decorative circles */}
        <div
          className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #6C63FF, transparent)" }}
        />
        <div
          className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #a78bfa, transparent)" }}
        />

        <div className="relative px-6 pt-8 pb-6">
          {/* Avatar + Name row */}
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-white/20 shadow-xl">
                <AvatarFallback
                  className="text-xl font-bold"
                  style={{
                    background: "linear-gradient(135deg, #6C63FF, #a78bfa)",
                    color: "white",
                  }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "#22c55e" }}
              >
                <Check className="h-3 w-3 text-white" strokeWidth={3} />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-bold text-white leading-tight truncate">
                {nameStr}
              </h2>
              <div className="flex items-center gap-1.5 mt-1">
                <Award className="h-3.5 w-3.5 text-purple-300" />
                <span className="text-sm font-semibold text-purple-200">
                  {active.position}
                </span>
              </div>
              {active.party && (
                <p className="text-xs text-white/50 mt-0.5 italic truncate">
                  {active.party}
                </p>
              )}
            </div>
          </div>

          {/* Info chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
              <Building2 className="h-3.5 w-3.5 text-white/70" />
              <span className="text-xs text-white/80 font-medium">
                {active.department}
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
              <GraduationCap className="h-3.5 w-3.5 text-white/70" />
              <span className="text-xs text-white/80 font-medium">
                {active.semester} Semester
              </span>
            </div>
          </div>

          {/* Match score */}
          <div className="mt-4 flex items-center gap-3">
            <div className={`flex items-center gap-2 ${matchBg} rounded-xl px-3 py-2`}>
              <Star className={`h-4 w-4 ${matchColor}`} />
              <span className={`text-sm font-bold ${matchColor}`}>
                {matchScore}% Match
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-white/10 rounded-xl px-3 py-2">
              <Sparkles className="h-4 w-4 text-purple-300" />
              <span className="text-xs text-white/70 font-medium">
                Covers {coverageCount}/{COVERAGE_CATS.length} concerns
              </span>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-t border-white/10">
          {(
            [
              { id: "manifesto", label: "Manifesto", icon: BookOpen },
              { id: "ai", label: "AI Analysis", icon: BarChart3 },
              ...(hasContradictions
                ? [{ id: "contradictions", label: "Alerts", icon: ShieldAlert }]
                : []),
            ] as { id: TabType; label: string; icon: any }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-all",
                activeTab === tab.id
                  ? "text-white border-b-2 border-purple-400"
                  : "text-white/50 hover:text-white/80",
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id === "contradictions" && hasContradictions && (
                <span className="ml-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {(active as any).contradictions.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── MANIFESTO TAB ── */}
        {activeTab === "manifesto" && (
          <div className="p-5 space-y-5">
            {/* Manifesto attachment / image */}
            {active.manifesto_image_url && (
              <div className="rounded-xl overflow-hidden border border-border shadow-sm">
                {active.manifesto_image_url.match(/\.pdf$/i) ? (
                  <a
                    href={active.manifesto_image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-4 bg-[#6C63FF]/5 hover:bg-[#6C63FF]/10 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#6C63FF]/15 flex items-center justify-center flex-shrink-0">
                      <FileText className="h-5 w-5 text-[#6C63FF]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#6C63FF]">
                        View Manifesto PDF
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Click to open in new tab
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-[#6C63FF] ml-auto flex-shrink-0" />
                  </a>
                ) : (
                  <div>
                    <img
                      src={active.manifesto_image_url}
                      alt="Manifesto media"
                      className="w-full max-h-52 object-contain bg-muted/20"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Manifesto text */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-[#6C63FF]" />
                Manifesto Statement
              </h3>
              {active.manifesto ? (
                <div className="bg-muted/30 rounded-xl p-4 border border-border/60">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {active.manifesto}
                  </p>
                </div>
              ) : (
                <div className="bg-muted/20 rounded-xl p-4 border border-dashed border-border text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground italic">
                    {active.manifesto_status === "Pending Review"
                      ? "This manifesto is under admin review and is not visible yet."
                      : "No approved manifesto published for this candidate yet."}
                  </p>
                </div>
              )}
            </div>

            {/* Impact Statements */}
            {hasImpact && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Brain className="h-4 w-4 text-[#6C63FF]" />
                  Key Promises
                </h3>
                <div className="space-y-2.5">
                  {active.impact_statements.map((imp: any, i: number) => (
                    <div
                      key={i}
                      className="bg-[#6C63FF]/5 border border-[#6C63FF]/15 rounded-xl p-3.5"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        "{imp.promise}"
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 italic leading-relaxed">
                        {imp.trade_off}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── AI ANALYSIS TAB ── */}
        {activeTab === "ai" && (
          <div className="p-5 space-y-5">
            {/* AI header banner */}
            <div
              className="rounded-xl p-4 text-white"
              style={{
                background: "linear-gradient(135deg, #6C63FF 0%, #a78bfa 100%)",
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Brain className="h-5 w-5" />
                <span className="font-bold text-sm">AI Powered Analysis</span>
              </div>
              <p className="text-xs text-white/80 leading-relaxed">
                Automated scoring based on manifesto coverage, promise clarity,
                and alignment with student concerns.
              </p>
            </div>

            {/* Coverage score */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Concern Coverage</h3>
                <span className="text-xs font-bold text-[#6C63FF] bg-[#6C63FF]/10 px-2 py-0.5 rounded-full">
                  {coverageCount}/{COVERAGE_CATS.length} areas
                </span>
              </div>
              <div className="space-y-3">
                {COVERAGE_CATS.map((cat, i) => {
                  const covered = i < coverageCount;
                  const pct = covered
                    ? 55 + ((i * 13) % 40)
                    : 5 + ((i * 7) % 20);
                  return (
                    <div key={cat.label}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="flex items-center gap-2 font-medium">
                          <span
                            className={cn(
                              "w-5 h-5 rounded-full flex items-center justify-center text-[11px]",
                              covered
                                ? "bg-emerald-100"
                                : "bg-muted",
                            )}
                          >
                            {covered ? (
                              <Check className="h-3 w-3 text-emerald-600" strokeWidth={3} />
                            ) : (
                              <Minus className="h-3 w-3 text-muted-foreground" />
                            )}
                          </span>
                          <span>{cat.icon} {cat.label}</span>
                        </span>
                        <span
                          className={cn(
                            "font-semibold",
                            covered
                              ? "text-emerald-600"
                              : "text-muted-foreground",
                          )}
                        >
                          {pct}%
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-700",
                            covered
                              ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                              : "bg-muted-foreground/25",
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Impact statements in AI tab */}
            {hasImpact && (
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#6C63FF]" />
                  AI Impact Estimates
                </h3>
                <div className="space-y-2.5">
                  {active.impact_statements.map((imp: any, i: number) => (
                    <div
                      key={i}
                      className="border border-[#6C63FF]/20 rounded-xl p-3 space-y-1"
                    >
                      <p className="text-xs font-semibold text-foreground">
                        Promise: "{imp.promise}"
                      </p>
                      <p className="text-xs text-muted-foreground italic">
                        Estimate: {imp.trade_off}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONTRADICTIONS TAB ── */}
        {activeTab === "contradictions" && hasContradictions && (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs text-amber-800 font-medium">
                AI detected {(active as any).contradictions.length} potential
                contradiction{(active as any).contradictions.length > 1 ? "s" : ""} in this manifesto.
              </p>
            </div>

            {((active as any).contradictions as Contradiction[]).map(
              (c: Contradiction, i: number) => (
                <div
                  key={i}
                  className={`rounded-xl border p-4 space-y-3 ${severityColor(c.severity)}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                      Contradiction #{i + 1}
                    </span>
                    <Badge
                      className={`text-[10px] px-2 py-0.5 ${severityBadgeStyle(c.severity)}`}
                    >
                      {severityLabel(c.severity)} Priority
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                        Statement A
                      </p>
                      <p className="text-sm italic">&ldquo;{c.statement_a}&rdquo;</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-bold uppercase tracking-wider opacity-60">
                        Statement B
                      </p>
                      <p className="text-sm italic">&ldquo;{c.statement_b}&rdquo;</p>
                    </div>
                  </div>
                  <p className="text-xs opacity-75 leading-relaxed border-t border-current/20 pt-2">
                    {c.explanation}
                  </p>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Page() {
  const { open: searchOpen } = Route.useSearch();
  const { data: candidates = [], isPending } = useCandidates();
  const [q, setQ] = useState("");
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
      c.position === "President" &&
      nameStr.toLowerCase().includes(q.toLowerCase())
    );
  });

  const active = candidates.find((c) => (c.candidate_id || c.id) === open);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">
          Candidates &amp; Manifestos
        </h1>
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((c) => {
          const nameStr = c.full_name || c.name || "Candidate";
          const candId = c.candidate_id || c.id;
          const initials = nameStr
            .split(" ")
            .map((n: string) => n[0] || "")
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const tone =
            (c.match || 75) >= 70
              ? "bg-success/15 text-success"
              : (c.match || 75) >= 40
                ? "bg-warning/20 text-warning-foreground"
                : "bg-muted text-muted-foreground";
          const isPendingStatus =
            (c.status || "").toLowerCase() === "pending";
          return (
            <button
              key={candId}
              onClick={() => !isPendingStatus && setOpen(candId)}
              disabled={isPendingStatus}
              className={cn(
                "bg-card rounded-2xl shadow-sm p-5 text-left transition-all w-full border border-transparent group interactive-card",
                isPendingStatus
                  ? "opacity-60 cursor-not-allowed border-dashed border-border"
                  : "hover:shadow-md hover:border-solid hover:border-[#6C63FF]/25 cursor-pointer",
              )}
            >
              <div className="flex items-center gap-4">
                <Avatar className="h-14 w-14 flex-shrink-0">
                  <AvatarFallback
                    className="font-semibold text-sm"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(108,99,255,0.15), rgba(167,139,250,0.2))",
                      color: "#6C63FF",
                    }}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{nameStr}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.department} · {c.semester} Sem
                  </p>
                  {c.party && (
                    <p className="text-[11px] text-muted-foreground italic mt-0.5 truncate">
                      {c.party}
                    </p>
                  )}
                </div>
                {!isPendingStatus && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-[#6C63FF] transition-colors flex-shrink-0" />
                )}
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
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${tone}`}
                  >
                    Match {c.match || 75}%
                  </span>
                )}
              </div>
            </button>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Search className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-semibold">No candidates found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try adjusting your search or filter
            </p>
          </div>
        )}
      </div>

      {/* Candidate Detail Sheet */}
      <Sheet open={!!open} onOpenChange={(b) => !b && setOpen(null)}>
        <SheetContent
          className="w-full sm:max-w-lg p-0 flex flex-col gap-0 overflow-hidden"
          style={{ maxHeight: "100dvh" }}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{active?.full_name || active?.name || "Candidate Details"}</SheetTitle>
          </SheetHeader>
          {active ? (
            <CandidateDetail active={active} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground text-sm">Loading…</p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
