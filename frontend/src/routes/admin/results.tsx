import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { Lock, Copy, FileDown, Trophy, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line } from "recharts";
import { toast } from "sonner";
import { fetchCurrentElection, fetchElectionResults, publishResults, fetchVoteIps, fetchHourlyVoteStats, API_BASE_URL } from "@/lib/api";
import { ReconfirmPasswordModal } from "@/components/ReconfirmPasswordModal";

function Page() {
  const [results, setResults] = useState<any[]>([]);
  const [electionId, setElectionId] = useState("");
  const [published, setPublished] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [reconfirmOpen, setReconfirmOpen] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [hourlyStats, setHourlyStats] = useState<any[]>([]);
  const [ipStats, setIpStats] = useState<any[]>([]);

  useEffect(() => {
    async function checkPublishedStatus() {
      try {
        const election = await fetchCurrentElection();
        if (election) {
          setElectionId(election.election_id);
          if (election.status === "RESULTS_PUBLISHED") {
            const data = await fetchElectionResults(election.election_id);
            setResults(data.results ?? []);
            setHash(data.integrity_hash ?? "");
            setPublished(true);

            try {
              const [hourlyData, ipData] = await Promise.all([
                fetchHourlyVoteStats(),
                fetchVoteIps()
              ]);
              setHourlyStats(hourlyData);
              setIpStats(ipData);
            } catch (e) {
              console.error("Failed to fetch additional admin results stats", e);
            }
          }
        }
      } catch (e) {
        console.error("Error checking published election status:", e);
      } finally {
        setPageLoading(false);
      }
    }
    checkPublishedStatus();
  }, []);


  if (pageLoading) return <PageLoader />;

  if (!published && !confirm) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl md:text-[28px] font-extrabold text-[#102A27]">Election Results</h1>
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 font-bold text-[#102A27]">Results not yet published</p>
          <p className="text-sm text-muted-foreground mt-1">
            Voting must close before results can be computed.
          </p>
          <Button
            className="mt-6 bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 shadow-sm rounded-xl font-bold"
            onClick={() => setConfirm(true)}
          >
            Publish Results
          </Button>
        </div>
      </div>
    );
  }

  if (!published) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-[#102A27]">Publish results?</h2>
          <p className="text-sm text-muted-foreground mt-2">
            This will notify all users and cannot be undone.
          </p>
          <div className="flex gap-2 mt-6 justify-center">
            <Button variant="outline" className="rounded-xl font-bold" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90 rounded-xl font-bold"
              disabled={loading}
              onClick={() => setReconfirmOpen(true)}
            >
              {loading ? "Publishing..." : "Confirm Publish"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!results.length) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl md:text-[28px] font-extrabold text-[#102A27]">Election Results</h1>
        <Button 
          variant="outline" 
          className="rounded-xl font-bold border-[#E6ECE9]"
          onClick={() => {
            if (electionId) {
              const link = document.createElement("a");
              link.href = `${API_BASE_URL}/election/${electionId}/results/pdf`;
              link.setAttribute("download", `results_${electionId}.pdf`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            } else {
              toast.error("Election ID not loaded");
            }
          }}
        >
          <FileDown className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {results.map((r) => {
          const sortedCandidates = [...(r.candidates || [])].sort((a: any, b: any) => b.votes - a.votes);
          const totalVotes = sortedCandidates.reduce((sum, c) => sum + c.votes, 0);
          const maxVotes = sortedCandidates.length > 0 ? sortedCandidates[0].votes : 0;
          
          // Determine tie cases
          const isTie = sortedCandidates.length > 1 && sortedCandidates[0].votes === sortedCandidates[1].votes;

          return (
            <div key={r.position} className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm p-5 flex flex-col gap-4 premium-card">
              {/* Position header with emerald tone */}
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#0F8A5F]/10 flex items-center justify-center shrink-0">
                    <Trophy className="h-4 w-4 text-[#D9A441]" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#102A27]">{r.position}</h2>
                    <p className="text-[10px] text-muted-foreground font-medium">{sortedCandidates.length} Candidates</p>
                  </div>
                </div>
                {maxVotes > 0 && isTie && (
                  <Badge className="bg-[#D97706] text-white border-0 text-[10px] font-bold py-0.5 px-2 rounded-full">
                    Tie Declared
                  </Badge>
                )}
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={r.candidates}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="votes" fill="#0F8A5F" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Detailed candidates list showing winner/percentage */}
              <div className="space-y-2 mt-2">
                <p className="text-xs font-bold text-[#102A27] border-b border-border/40 pb-1 flex items-center gap-1.5">
                  <Trophy className="h-3 w-3 text-[#D9A441]" />
                  Detailed Tally
                </p>
                {sortedCandidates.map((cand) => {
                  const pct = cand.percentage ?? (totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : 0);
                  const isWinner = maxVotes > 0 && cand.votes === maxVotes;

                  return (
                    <div
                      key={cand.name}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border text-xs transition-all duration-150",
                        isWinner 
                          ? isTie
                            ? "bg-amber-50/50 border-amber-200 shadow-sm"
                            : "bg-[#16A34A]/5 border-[#16A34A]/20 shadow-sm" 
                          : "bg-[#F8FAF9]/40 border-[#E6ECE9] hover:border-[#0F8A5F]/20"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {isWinner && (
                          <div className={cn(
                            "h-7 w-7 rounded-full flex items-center justify-center shrink-0 border",
                            isTie ? "bg-amber-100 border-amber-200 text-[#D97706]" : "bg-[#16A34A]/10 border-[#16A34A]/25 text-[#16A34A]"
                          )}>
                            <Trophy className="h-3.5 w-3.5" />
                          </div>
                        )}
                        <span className={cn("text-xs font-bold", isWinner ? "text-[#102A27]" : "text-muted-foreground")}>{cand.name}</span>
                        {isWinner && (
                          isTie ? (
                            <span className="text-[9px] bg-amber-100 text-[#D97706] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              Tied Leader
                            </span>
                          ) : (
                            <span className="text-[9px] bg-[#16A34A]/10 text-[#16A34A] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              Winner
                            </span>
                          )
                        )}
                      </div>
                      <div className="text-right text-muted-foreground font-mono text-xs">
                        <span className={cn("font-bold", isWinner ? isTie ? "text-[#D97706]" : "text-[#16A34A]" : "")}>{cand.votes}</span> votes ({pct}%)
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Voting Timeline (Hourly) */}
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm p-5 flex flex-col premium-card">
          <div>
            <h2 className="text-sm font-bold text-[#102A27]">Voting Timeline (Hourly)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Real-time vote count distribution by hour</p>
          </div>
          <div className="mt-4 flex-1 min-h-[260px] flex items-center justify-center">
            {hourlyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={hourlyStats.map(h => ({
                    time: new Date(h.hour).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }),
                    votes: h.votes
                  }))}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="votes" stroke="#0F8A5F" strokeWidth={2.5} activeDot={{ r: 6, fill: "#0F8A5F" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground font-medium">No voting timeline data available.</p>
            )}
          </div>
        </div>

        {/* Vote IP Sources */}
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] shadow-sm p-5 flex flex-col premium-card">
          <div>
            <h2 className="text-sm font-bold text-[#102A27]">Vote Sources (IP Auditing)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Forensic tracking of client IP address vote submissions</p>
          </div>
          <div className="mt-4 flex-1 overflow-y-auto max-h-[260px] border border-border/40 rounded-xl scrollbar-thin text-card-foreground">
            {ipStats.length > 0 ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/50 border-b border-border/40 text-muted-foreground font-semibold">
                    <th className="p-3">IP Address</th>
                    <th className="p-3 text-right">Votes Cast</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {ipStats.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 font-mono text-foreground">{item.ip}</td>
                      <td className="p-3 text-right font-semibold text-foreground">{item.votes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No IP address stats available.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-[#0F8A5F]/5 border border-[#0F8A5F]/20 rounded-[20px] p-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-semibold">SHA-256 Integrity Hash</p>
          <p className="font-mono text-xs break-all text-[#102A27] font-bold mt-1">{hash}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl font-bold border-[#0F8A5F]/20"
          onClick={() => {
            navigator.clipboard?.writeText(hash);
            toast.success("Hash copied");
          }}
        >
          <Copy className="h-3.5 w-3.5 mr-1" />
          Copy
        </Button>
      </div>

      {/* Password Reconfirmation Modal */}
      <ReconfirmPasswordModal
        open={reconfirmOpen}
        onOpenChange={setReconfirmOpen}
        title="Publish Results"
        description="Publishing results is a sensitive action. Please confirm your password to proceed."
        actionLabel="Confirm Publish"
        onVerified={async () => {
          setLoading(true);
          try {
            const election = await fetchCurrentElection();
            await publishResults(election.election_id);
            const data = await fetchElectionResults(election.election_id);
            setResults(data.results ?? []);
            setHash(data.integrity_hash ?? "");
            setPublished(true);
            setConfirm(false);
            toast.success("Results published");

            try {
              const [hourlyData, ipData] = await Promise.all([
                fetchHourlyVoteStats(),
                fetchVoteIps()
              ]);
              setHourlyStats(hourlyData);
              setIpStats(ipData);
            } catch (err) {
              console.error(err);
            }
          } catch (e: any) {
            toast.error(e?.message || "Failed to publish results");
          } finally {
            setLoading(false);
          }
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/admin/results")({ component: Page });
