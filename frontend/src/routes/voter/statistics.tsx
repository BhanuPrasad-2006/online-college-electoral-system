import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useDeptTurnout, useHourlyVotes, useCurrentPhase, useElection, usePublicResults, useKpi } from "@/hooks/use-election-data";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Info, Search, TrendingUp, Lock, Clock, Eye, Trophy, BarChart3 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voter/statistics")({ component: Page });

function Page() {
  const nav = useNavigate();
  const { data: deptTurnout = [], isPending: loadingDept } = useDeptTurnout();
  const { data: hourlyVotes = [], isPending: loadingHourly } = useHourlyVotes();
  const { data: kpi, isPending: loadingKpi } = useKpi();
  const { data: phaseData } = useCurrentPhase();
  const { data: election } = useElection();
  const { data: publicResults } = usePublicResults();
  const [searchQuery, setSearchQuery] = useState("");
  const [gatedPhase, setGatedPhase] = useState<string | null>(null);

  useEffect(() => {
    if (phaseData) {
      setGatedPhase(phaseData.phase);
    }
  }, [phaseData]);

  if ((loadingDept || loadingHourly || loadingKpi) && gatedPhase !== "pre_registration" && gatedPhase !== "registration_open" && gatedPhase !== "registration_closed" && gatedPhase !== "campaign_period") {
    return <PageLoader />;
  }

  // Phase-based gating
  const isPreVoting =
    gatedPhase === "pre_registration" ||
    gatedPhase === "registration_open" ||
    gatedPhase === "registration_closed" ||
    gatedPhase === "campaign_period";

  const isVotingOpen = gatedPhase === "voting_open";
  const isVotingClosed = gatedPhase === "voting_closed";
  const isResultsAnnounced = gatedPhase === "results_announced";

  // Show full results (with candidate rankings) only after published
  const showFullResults = isResultsAnnounced;

  const registered = kpi?.registered ?? 0;
  const votesCast = kpi?.votesCast ?? 0;
  const votedPct = registered > 0 ? Math.round((votesCast / registered) * 100) : 0;
  const remainingPct = 100 - votedPct;

  const turnoutData = [
    { name: "Voted", value: votedPct },
    { name: "Remaining", value: remainingPct },
  ];
  const COLORS = ["#0F8A5F", "#E5E7EB"];
  const totalVotes = turnoutData.reduce((sum, item) => sum + item.value, 0);
  const votedPercent = totalVotes > 0 ? Math.round((turnoutData[0].value / totalVotes) * 100) : 0;

  // Filter department stats based on search
  const filteredDepts = deptTurnout.filter((d: any) =>
    (d.department || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Statistics</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aggregated election data and turnout insights.
        </p>
      </div>

      {/* ── Pre-Voting: Locked Screen ── */}
      {isPreVoting && (
        <div className="min-h-[300px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-muted/60 flex items-center justify-center">
            <Lock className="h-8 w-8 text-muted-foreground/60" />
          </div>
          <h2 className="text-xl font-bold text-foreground/80">Statistics Locked</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Voting hasn't opened yet. Live turnout data and department breakdowns will become
            available once voting begins.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Current Phase: {gatedPhase?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
          </div>
        </div>
      )}

      {/* ── Voting Currently Active: Live Turnout Only ── */}
      {isVotingOpen && (
        <>
          <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex gap-3">
            <Eye className="h-5 w-5 text-success shrink-0 mt-0.5" />
            <p className="text-sm">
              Live turnout data is shown below. Full results with candidate rankings will be
              published after voting closes.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Chart title="Overall Turnout">
              <div className="grid gap-6 md:grid-cols-[minmax(200px,300px)_1fr] md:items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={turnoutData}
                      innerRadius={70}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {turnoutData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid gap-4">
                  <Stat label="Voted" value={`${turnoutData[0].value}%`} tone="primary" />
                  <Stat label="Remaining" value={`${turnoutData[1].value}%`} tone="muted" />
                  <Stat label="Turnout" value={`${votedPercent}%`} tone="dark" />
                </div>
              </div>
            </Chart>

            <Chart title="Votes by Hour">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={hourlyVotes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="votes"
                    stroke="#0F8A5F"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Chart>
          </div>

          <div className="bg-card rounded-2xl border border-border/70 shadow-sm p-6 mt-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#0F8A5F]" />
                <h2 className="text-xl font-semibold">Department Breakdown</h2>
              </div>
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  placeholder="Search departments..."
                  className="pl-9 pr-4 py-2 w-full rounded-xl border border-border/60 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-[#0F8A5F]/40 text-sm transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <DepartmentCards departments={filteredDepts} searchQuery={searchQuery} />
          </div>
        </>
      )}

      {/* ── Voting Closed, Results Pending ── */}
      {isVotingClosed && (
        <div className="min-h-[300px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-amber-100/60 flex items-center justify-center">
            <BarChart3 className="h-8 w-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground/80">Results Being Tabulated</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Voting has closed. The election committee is tabulating and verifying results.
            Full results will be published shortly.
          </p>
          {turnoutData[0].value > 0 && (
            <p className="text-xs text-muted-foreground">
              Turnout so far: {votedPercent}%
            </p>
          )}
        </div>
      )}

      {/* ── Results Announced: Full Data ── */}
      {isResultsAnnounced && (
        <>
          <div className="bg-[#0F8A5F]/10 border border-[#D9A441]/30 rounded-xl p-4 flex gap-3">
            <Info className="h-5 w-5 text-[#0F8A5F] shrink-0 mt-0.5" />
            <p className="text-sm">
              Individual voter data is never displayed. All statistics are aggregated.
            </p>
          </div>

          {/* Final Results */}
          {publicResults && publicResults.results && (
            <div className="bg-card rounded-2xl border border-border/70 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-6">
                <Trophy className="h-5 w-5 text-amber-500" />
                <h2 className="text-xl font-semibold">Final Results</h2>
              </div>
              <div className="space-y-8">
                {publicResults.results.map((positionResult: any, idx: number) => (
                  <div key={idx}>
                    <h3 className="text-base font-bold text-[#0F8A5F] mb-3">{positionResult.position}</h3>
                    <div className="space-y-2">
                      {positionResult.candidates
                        .sort((a: any, b: any) => b.votes - a.votes)
                        .map((cand: any, ci: number) => {
                          const totalVotesForPos = positionResult.candidates.reduce((s: number, c: any) => s + c.votes, 0);
                          const pct = totalVotesForPos > 0 ? Math.round((cand.votes / totalVotesForPos) * 100) : 0;
                          const isWinner = ci === 0;
                          return (
                            <div
                              key={ci}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border",
                                isWinner
                                  ? "bg-success/10 border-success/30"
                                  : "bg-background border-border/50",
                              )}
                            >
                              <div className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold",
                                isWinner ? "bg-amber-100 text-amber-700" : "bg-muted text-muted-foreground",
                              )}>
                                {isWinner ? "🏆" : `#${ci + 1}`}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate">
                                  {cand.name} {isWinner && <span className="text-xs text-success font-normal">(Winner)</span>}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className={cn(
                                        "h-full rounded-full transition-all",
                                        isWinner ? "bg-success" : "bg-[#0F8A5F]/60",
                                      )}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-semibold text-muted-foreground w-16 text-right">
                                    {cand.votes} ({pct}%)
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Turnout & Hourly Charts */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
            <Chart title="Overall Turnout">
              <div className="grid gap-6 md:grid-cols-[minmax(200px,300px)_1fr] md:items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={turnoutData}
                      innerRadius={70}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {turnoutData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid gap-4">
                  <Stat label="Voted" value={`${turnoutData[0].value}%`} tone="primary" />
                  <Stat label="Remaining" value={`${turnoutData[1].value}%`} tone="muted" />
                  <Stat label="Turnout" value={`${votedPercent}%`} tone="dark" />
                </div>
              </div>
            </Chart>

            <Chart title="Votes by Hour">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={hourlyVotes}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="hour" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="votes"
                    stroke="#0F8A5F"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Chart>
          </div>

          <div className="bg-card rounded-2xl border border-border/70 shadow-sm p-6 mt-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-[#0F8A5F]" />
                <h2 className="text-xl font-semibold">Department Breakdown</h2>
              </div>
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-muted-foreground" />
                </div>
                <input
                  type="text"
                  placeholder="Search departments..."
                  className="pl-9 pr-4 py-2 w-full rounded-xl border border-border/60 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-[#0F8A5F]/40 text-sm transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <DepartmentCards departments={filteredDepts} searchQuery={searchQuery} />
          </div>
        </>
      )}
    </div>
  );
}

function DepartmentCards({ departments, searchQuery }: { departments: any[]; searchQuery: string }) {
  if (departments.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        No departments found matching "{searchQuery}"
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {departments.map((stat: any, i: number) => (
        <div
          key={stat.department}
          className={cn(
            "bg-background border border-border/50 rounded-2xl p-5 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-[#D9A441]/30 transition-all",
            "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
          )}
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg text-[#0F8A5F]">{stat.department}</h3>
            <div className="px-2.5 py-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded-lg text-sm font-semibold border border-violet-200 dark:border-violet-800/30">
              {stat.turnout_percentage}%
            </div>
          </div>

          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#0F8A5F] to-violet-400 h-full transition-all duration-1000 ease-out"
              style={{ width: `${stat.turnout_percentage}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mt-1 pt-3 border-t border-border/40 text-center">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                Total
              </span>
              <span className="font-bold text-base">{stat.total_voters}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-success/80 uppercase tracking-wider font-semibold mb-1">
                Voted
              </span>
              <span className="font-bold text-base text-success">{stat.voted}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-1">
                Pending
              </span>
              <span className="font-bold text-base">{stat.not_voted}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Chart({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-card rounded-2xl border border-border/70 shadow-sm p-5 flex flex-col h-full ${className}`}
    >
      <h2 className="text-base font-semibold mb-4">{title}</h2>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "muted" | "dark";
}) {
  const toneClass =
    tone === "primary"
      ? "bg-[#D9A441]/10 text-[#D9A441] border-[#D9A441]/20"
      : tone === "dark"
        ? "bg-[#D9A441]/10 text-[#D9A441] border-[#D9A441]/20"
        : "bg-muted text-muted-foreground border-border/50";

  return (
    <div className="rounded-xl border border-border/70 bg-background/60 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </p>
      <p className={`mt-2 inline-flex rounded-lg px-3 py-1 text-xl font-bold border ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}
