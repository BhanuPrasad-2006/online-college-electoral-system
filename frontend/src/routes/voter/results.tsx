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
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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
  const COLORS = ["#0F8A5F", "#E6ECE9"];
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
          const totalVotesForPos = sorted.reduce((sum, c) => sum + c.votes, 0);
          const maxVotes = sorted.length > 0 ? sorted[0].votes : 0;
          
          // Determine tie cases
          const isTie = sorted.length > 1 && sorted[0].votes === sorted[1].votes;
          const winners = sorted.filter(c => c.votes === maxVotes && maxVotes > 0);
          const winnerNames = winners.map((w: any) => w.name).join(", ");

          return (
            <div
              key={positionResult.position}
              className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm overflow-hidden premium-card"
            >
              {/* Position Header Banner */}
              <div className="bg-gradient-to-r from-primary-dark to-secondary-dark px-6 py-5 flex items-center justify-between border-b border-[#E6ECE9]">
                <div>
                  <p className="text-[10px] font-bold text-[#16A34A] uppercase tracking-widest">Contested Position</p>
                  <h2 className="text-base font-extrabold text-white flex items-center gap-2 mt-0.5">
                    <Trophy className="h-5 w-5 text-[#D9A441] animate-pulse-subtle" />
                    {positionResult.position}
                  </h2>
                </div>
                {maxVotes > 0 && (
                  <div className="flex items-center gap-2">
                    {isTie ? (
                      <Badge className="bg-[#D97706] text-white border-0 text-[11px] font-bold py-1 px-3 rounded-full flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                        Tie Declared
                      </Badge>
                    ) : (
                      <Badge className="bg-[#16A34A]/20 text-[#16A34A] border border-[#16A34A]/30 text-[11px] font-bold py-1 px-3 rounded-full flex items-center gap-1 backdrop-blur-sm">
                        <Crown className="h-3.5 w-3.5 text-[#D9A441] mr-1" />
                        Winner: {winners[0].name}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Candidates list for this position */}
              <div className="p-6 space-y-4">
                {sorted.map((cand, ci) => {
                  const pct =
                    totalVotesForPos > 0
                      ? Math.round((cand.votes / totalVotesForPos) * 100)
                      : 0;
                  const isWinner = maxVotes > 0 && cand.votes === maxVotes;
                  
                  return (
                    <div
                      key={ci}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-200",
                        isWinner
                          ? isTie
                            ? "bg-amber-50/50 border-amber-200/60 shadow-sm"
                            : "bg-[#16A34A]/5 border-[#16A34A]/20 shadow-sm"
                          : "bg-white border-[#E6ECE9] hover:border-[#0F8A5F]/20",
                      )}
                    >
                      {/* Winner Card Trophy/Rank Circle */}
                      <div
                        className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border",
                          isWinner
                            ? isTie
                              ? "bg-amber-100/60 border-amber-200 text-[#D97706]"
                              : "bg-[#16A34A]/10 border-[#16A34A]/25 text-[#16A34A]"
                            : "bg-[#F8FAF9] border-[#E6ECE9] text-muted-foreground",
                        )}
                      >
                        {isWinner ? (
                          isTie ? (
                            <AlertTriangle className="h-5 w-5" />
                          ) : (
                            <Trophy className="h-5 w-5 text-[#D9A441]" />
                          )
                        ) : (
                          <Medal className="h-5 w-5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm text-[#102A27]">
                            {cand.name}
                          </p>
                          {isWinner && (
                            isTie ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#D97706] bg-[#D97706]/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                Tied Leader
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#16A34A] bg-[#16A34A]/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                <Crown className="h-3 w-3 text-[#D9A441]" />
                                Winner
                              </span>
                            )
                          )}
                        </div>

                        {/* Progress Bar & Percentage */}
                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-1000 ease-out",
                                isWinner
                                  ? isTie
                                    ? "bg-gradient-to-r from-[#D97706] to-[#F59E0B]"
                                    : "bg-gradient-to-r from-[#0F8A5F] to-[#16A34A]"
                                  : "bg-gray-300",
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-muted-foreground w-28 text-right tabular-nums shrink-0">
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
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm p-6 premium-card">
          <h2 className="text-lg font-bold text-[#102A27] flex items-center gap-2 mb-6">
            <BarChart3 className="h-5 w-5 text-[#0F8A5F]" />
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
                <p className="text-4xl font-extrabold text-[#0F8A5F]">
                  {votedPercent}%
                </p>
                <p className="text-sm text-muted-foreground font-semibold">
                  Total Voter Turnout
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Voted</span>
                  <span className="font-bold text-[#102A27]">{votedPercent}%</span>
                </div>
                <div className="h-2 bg-gray-150 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#0F8A5F] rounded-full transition-all duration-1000"
                    style={{ width: `${votedPercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Remaining</span>
                  <span className="font-bold text-[#102A27]">{100 - votedPercent}%</span>
                </div>
                <div className="h-2 bg-gray-150 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#E6ECE9] rounded-full transition-all duration-1000"
                    style={{ width: `${100 - votedPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Department Turnout */}
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm p-6 premium-card">
          <h2 className="text-lg font-bold text-[#102A27] flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-[#0F8A5F]" />
            Department-wise Turnout
          </h2>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search departments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border/60 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#0F8A5F]/30 focus:border-[#0F8A5F] transition-all"
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
                      <span className="text-xs font-bold text-[#0F8A5F]">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-primary to-secondary-dark rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
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