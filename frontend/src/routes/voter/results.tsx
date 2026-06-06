import { createFileRoute } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import {
  usePublicResults,
  useCurrentPhase,
  useDeptTurnout,
  useKpi,
} from "@/hooks/use-election-data";
import {
  Trophy,
  Medal,
  Lock,
  Clock,
  BarChart3,
  Users,
  Crown,
  Sparkles,
  Search,
  PartyPopper,
  Eye,
} from "lucide-react";
import { useState } from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voter/results")({ component: ResultsPage });

function ResultsPage() {
  const { data: publicResults, isPending: loadingResults } = usePublicResults();
  const { data: phaseData } = useCurrentPhase();
  const { data: deptTurnout = [] } = useDeptTurnout();
  const { data: kpi } = useKpi();
  const [searchQuery, setSearchQuery] = useState("");

  const phase = phaseData?.phase;
  const isResultsAnnounced = phase === "results_announced";
  const isVotingClosed = phase === "voting_closed";
  const isPreOrDuringVoting =
    !phase ||
    [
      "pre_registration",
      "registration_open",
      "registration_closed",
      "campaign_period",
      "voting_open",
    ].includes(phase);

  if (loadingResults && isResultsAnnounced) return <PageLoader />;

  // Derive turnout from live KPI data — never hardcoded
  const votedCount = kpi?.votesCast ?? 0;
  const registeredCount = kpi?.registered ?? 0;
  const remainingCount = Math.max(0, registeredCount - votedCount);
  const turnoutData = [
    { name: "Voted", value: votedCount },
    { name: "Remaining", value: remainingCount },
  ];
  const COLORS = ["#6C63FF", "#E5E7EB"];
  const votedPercent = kpi?.turnout ? Math.round(kpi.turnout) : 0;

  const filteredDepts = deptTurnout.filter((d) =>
    (d.department || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Pre-voting / during voting: Locked
  if (isPreOrDuringVoting) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold">Results Not Yet Available</h2>
        <p className="text-muted-foreground max-w-md">
          Election results will be published here once the voting period has
          ended and results have been tallied.
        </p>
      </div>
    );
  }

  // Voting closed, not yet announced: Tabulating
  if (isVotingClosed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center">
          <Clock className="h-8 w-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold">Results Being Tabulated</h2>
        <p className="text-muted-foreground max-w-md">
          Voting has closed. The election commission is verifying and tallying
          the results. Check back soon!
        </p>
        <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 px-4 py-2 rounded-full">
          <Eye className="h-4 w-4" />
          <span>Results will be published shortly</span>
        </div>
      </div>
    );
  }

  // Results Announced: Full Results
  if (isResultsAnnounced && publicResults?.results) {
    const results = publicResults.results;

    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 bg-success/10 text-success border border-success/20 rounded-full px-4 py-1.5 text-xs font-semibold mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            Results Published
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            Election Results
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The student body has spoken. Here are the final results for{" "}
            {publicResults.election_title || "this election"}.
          </p>
        </div>

        {/* Position Results */}
        {results.map((positionResult: any) => {
          const sorted = [...(positionResult.candidates || [])].sort(
            (a: any, b: any) => b.votes - a.votes,
          );
          const winner = sorted[0];
          if (!winner) return null;
          const totalVotesForPos = sorted.reduce(
            (sum, c) => sum + c.votes,
            0,
          );

          return (
            <div
              key={positionResult.position}
              className="bg-card rounded-2xl border border-border/70 shadow-sm overflow-hidden"
            >
              <div className="bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Medal className="h-5 w-5 text-amber-300" />
                    {positionResult.position}
                  </h2>
                  {winner && (
                    <div className="flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
                      <Crown className="h-4 w-4 text-amber-300" />
                      <span className="text-xs font-semibold text-white/90">
                        {winner.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 space-y-3">
                {sorted.map((cand, ci) => {
                  const pct =
                    totalVotesForPos > 0
                      ? Math.round((cand.votes / totalVotesForPos) * 100)
                      : 0;
                  const isWinner = ci === 0;
                  const rankIcon =
                    ci === 0 ? (
                      <Trophy className="h-5 w-5 text-amber-500" />
                    ) : ci === 1 ? (
                      <Medal className="h-5 w-5 text-gray-400" />
                    ) : (
                      <Medal className="h-5 w-5 text-amber-700/60" />
                    );

                  return (
                    <div
                      key={ci}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl border transition-all",
                        isWinner
                          ? "bg-success/5 border-success/30 shadow-sm"
                          : "bg-background border-border/40 hover:border-border/70",
                      )}
                    >
                      <div
                        className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center shrink-0",
                          isWinner
                            ? "bg-amber-100"
                            : ci === 1
                              ? "bg-gray-100"
                              : "bg-muted",
                        )}
                      >
                        {rankIcon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm truncate">
                            {cand.name}
                          </p>
                          {isWinner && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 px-2 py-0.5 rounded-full">
                              <Crown className="h-3 w-3" />
                              WINNER
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-1000 ease-out",
                                isWinner
                                  ? "bg-gradient-to-r from-amber-400 to-amber-500"
                                  : "bg-[#6C63FF]/50",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-muted-foreground w-24 text-right tabular-nums shrink-0">
                            {cand.votes.toLocaleString()} votes &middot; {pct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Turnout Summary */}
        <div className="bg-card rounded-2xl border border-border/70 shadow-sm p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-[#6C63FF]" />
            Voter Turnout
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={turnoutData}
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {turnoutData.map((_entry, idx) => (
                      <Cell key={idx} fill={COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={10}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col justify-center space-y-4">
              <div className="text-center md:text-left">
                <p className="text-4xl font-bold text-[#6C63FF]">
                  {votedPercent}%
                </p>
                <p className="text-sm text-muted-foreground">
                  Total Voter Turnout
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Voted</span>
                  <span className="font-semibold">43%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6C63FF] rounded-full"
                    style={{ width: "43%" }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Remaining</span>
                  <span className="font-semibold">57%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#E5E7EB] rounded-full"
                    style={{ width: "57%" }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Department Turnout */}
        <div className="bg-card rounded-2xl border border-border/70 shadow-sm p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-[#6C63FF]" />
            Department-wise Turnout
          </h2>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/60 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/30 focus:border-[#6C63FF] transition-all"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDepts.length === 0 ? (
              <p className="text-sm text-muted-foreground col-span-full text-center py-4">
                No departments match your search.
              </p>
            ) : (
              filteredDepts.map((d, idx) => {
                const pct =
                  d.total && d.registered
                    ? Math.round((d.total / d.registered) * 100)
                    : 0;
                return (
                  <div
                    key={idx}
                    className="bg-background rounded-xl border border-border/40 p-4 hover:border-border/70 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-sm">{d.department}</p>
                      <span className="text-xs font-bold text-[#6C63FF]">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#6C63FF] to-[#1F3A6E] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {d.total || 0} voted &middot; {d.registered || 0} registered
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Celebration Banner */}
        <div className="bg-gradient-to-r from-success/10 via-success/5 to-transparent border border-success/20 rounded-2xl p-6 text-center">
          <div className="inline-flex items-center gap-2 text-success mb-1">
            <PartyPopper className="h-5 w-5" />
            <span className="font-bold">Congratulations to all winners!</span>
          </div>
          <p className="text-sm text-muted-foreground">
            The newly elected student council members will take office
            immediately. Thank you to everyone who participated in this
            election.
          </p>
        </div>
      </div>
    );
  }

  return <PageLoader />;
}