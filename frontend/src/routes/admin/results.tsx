import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { Lock, Copy, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Election Results</h1>
        </div>
        <div className="bg-card rounded-2xl shadow-sm p-12 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 font-semibold">Results not yet published</p>
          <p className="text-sm text-muted-foreground mt-1">
            Voting must close before results can be computed.
          </p>
          <Button
            className="mt-6 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90"
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
        <div className="bg-card rounded-2xl shadow-sm p-8 max-w-md text-center">
          <h2 className="text-lg font-semibold">Publish results?</h2>
          <p className="text-sm text-muted-foreground mt-2">
            This will notify all users and cannot be undone.
          </p>
          <div className="flex gap-2 mt-6 justify-center">
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
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
        <h1 className="text-2xl md:text-[28px] font-bold">Election Results</h1>
        <Button 
          variant="outline" 
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

          return (
            <div key={r.position} className="bg-card rounded-2xl shadow-sm p-5 border border-border/60 flex flex-col gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#1F3A6E]">{r.position}</h2>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={r.candidates}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="votes" fill="#1F3A6E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>

              {/* Detailed candidates list showing winner/percentage */}
              <div className="space-y-2 mt-2">
                <p className="text-xs font-semibold text-[#1F3A6E] border-b pb-1">Detailed Tally</p>
                {sortedCandidates.map((cand) => {
                  const pct = cand.percentage ?? (totalVotes > 0 ? ((cand.votes / totalVotes) * 100).toFixed(1) : 0);
                  const isWinner = cand.is_winner === true;

                  return (
                    <div
                      key={cand.name}
                      className={`flex items-center justify-between p-2 rounded-lg border text-sm transition-colors ${
                        isWinner 
                          ? "bg-success/5 border-success/30 font-medium" 
                          : "bg-background/40 border-border/40"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {isWinner && <span className="text-amber-500">🏆</span>}
                        <span className="font-semibold text-card-foreground">{cand.name}</span>
                        {isWinner && (
                          <span className="text-[10px] bg-success/10 text-success px-1.5 py-0.5 rounded-full font-bold">
                            Winner
                          </span>
                        )}
                      </div>
                      <div className="text-right text-muted-foreground font-mono text-xs">
                        {cand.votes} votes ({pct}%)
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
        <div className="bg-card rounded-2xl shadow-sm p-5 border border-border/60 flex flex-col">
          <div>
            <h2 className="text-base font-semibold text-[#1F3A6E]">Voting Timeline (Hourly)</h2>
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
                  <Line type="monotone" dataKey="votes" stroke="#6C63FF" strokeWidth={2.5} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No voting timeline data available.</p>
            )}
          </div>
        </div>

        {/* Vote IP Sources */}
        <div className="bg-card rounded-2xl shadow-sm p-5 border border-border/60 flex flex-col">
          <div>
            <h2 className="text-base font-semibold text-[#1F3A6E]">Vote Sources (IP Auditing)</h2>
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

      <div className="bg-muted/40 rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap border border-border/40">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">SHA-256 Integrity Hash</p>
          <p className="font-mono text-xs break-all">{hash}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
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
