import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/PageLoader";
import { useAiAlerts, useKpi, useElection } from "@/hooks/use-election-data";
import { useAntiAbuse } from "@/hooks/useAntiAbuse";
import { Users, CheckCircle2, TrendingUp, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { resolveAiAlert, publishResults, fetchElectionResults } from "@/lib/api";
import { useEffect } from "react";

function Page() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { adminRole } = useAuth();
  
  const canManageElection = adminRole === "SUPER_ADMIN" || adminRole === "ELECTION_MANAGER";
  const canManageAlerts = adminRole === "SUPER_ADMIN" || adminRole === "AUDIT_SECURITY_ADMIN";
  const isSuperAdmin = adminRole === "SUPER_ADMIN";

  const { data: kpi, isPending: loadingKpi } = useKpi();
  const { data: election, isPending: loadingElection } = useElection();
  const { data: aiAlerts = [], isPending: loadingAlerts, refetch: refetchAlerts } = useAiAlerts({
    enabled: canManageAlerts,
  });
  const antiAbuse = useAntiAbuse();

  const [sealing, setSealing] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [publishedResults, setPublishedResults] = useState<any>(null);

  useEffect(() => {
    if (election?.status === "RESULTS_PUBLISHED" && election?.election_id) {
      fetchElectionResults(election.election_id)
        .then((data) => setPublishedResults(data))
        .catch((err) => console.error("Error fetching results for dashboard:", err));
    }
  }, [election]);


  if (loadingKpi || loadingElection || (canManageAlerts && loadingAlerts) || !kpi) {
    return <PageLoader />;
  }

  const activeAlerts = aiAlerts.filter((a: any) => !a.is_resolved);

  const handleDismiss = async (alertId: string) => {
    if (resolvingId) return;
    setResolvingId(alertId);
    try {
      await resolveAiAlert(alertId);
      toast.success("Alert resolved successfully");
      refetchAlerts();
      queryClient.invalidateQueries({ queryKey: ["kpi"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to resolve alert");
    } finally {
      setResolvingId(null);
    }
  };

  const handleSealResults = async () => {
    if (!election || !election.election_id) {
      toast.error("No active election found.");
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to seal and publish the results? This action is irreversible and will finalize the election."
    );
    if (!confirmed) return;

    setSealing(true);
    try {
      await publishResults(election.election_id);
      toast.success("Results sealed and published successfully!");
      queryClient.invalidateQueries({ queryKey: ["election"] });
      queryClient.invalidateQueries({ queryKey: ["kpi"] });
      antiAbuse.startCooldown("seal-results", 5);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to seal/publish results");
    } finally {
      setSealing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" subtitle="Election operations overview" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Registered Voters"
          value={kpi.registered.toLocaleString()}
          layout="col"
          delay={50}
        />
        <StatCard
          icon={CheckCircle2}
          label="Votes Cast"
          value={kpi.votesCast.toLocaleString()}
          tone="bg-success/15 text-success"
          layout="col"
          delay={100}
        />
        <StatCard
          icon={TrendingUp}
          label="Turnout"
          value={`${kpi.turnout}%`}
          tone="bg-[#1F3A6E]/10 text-[#1F3A6E]"
          layout="col"
          delay={150}
        />
        <StatCard
          icon={AlertTriangle}
          label="Active AI Alerts"
          value={kpi.alerts}
          tone="bg-destructive/10 text-destructive"
          layout="col"
          delay={200}
        />
      </div>

      {election?.status === "RESULTS_PUBLISHED" && publishedResults && (
        <SectionCard delay={220} className="border-success/30 bg-success/5">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <div>
              <h2 className="text-lg font-bold text-[#1F3A6E] flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                Results Published ✓
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Published: {election.results_published_at ? new Date(election.results_published_at).toLocaleString() : "Just now"}
              </p>
            </div>
            <Badge className="bg-success text-white">Sealed</Badge>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Winner Summary</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {publishedResults.results?.map((r: any) => {
                const winners = r.candidates?.filter((c: any) => c.is_winner === true) || [];
                const winnerNames = winners.map((w: any) => w.name).join(", ");
                return (
                  <div key={r.position} className="bg-card p-3 rounded-xl border border-border/50 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground font-semibold uppercase">{r.position}</p>
                      <p className="font-bold text-sm text-[#1F3A6E] mt-1 flex items-center gap-1.5">
                        {winners.length > 0 ? (
                          <>
                            <span>🏆</span>
                            <span>{winnerNames}</span>
                          </>
                        ) : (
                          "No winner declared"
                        )}
                      </p>
                    </div>
                    {winners.length > 0 && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">Highest votes</p>
                        <p className="text-xs font-mono font-bold text-success">{winners[0].votes} votes</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Phase title="Registration" status="OPEN" tone="bg-success/15 text-success" delay={250} />
        <Phase
          title="Voting"
          status="SCHEDULED"
          tone="bg-warning/20 text-warning-foreground"
          cta="Activate"
          disabled={!canManageElection}
          delay={300}
        />
        <Phase title="Results" status="PENDING" tone="bg-muted text-muted-foreground" delay={350} />
      </div>

      {canManageAlerts && (
        <SectionCard delay={400}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">AI Fraud Alerts</h2>
            <Badge variant="outline" className="border-destructive/40 text-destructive animate-pulse">
              Live
            </Badge>
          </div>
          <div className="space-y-3">
            {activeAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active AI alerts detected.</p>
            ) : (
              activeAlerts.map((a: any, i: number) => (
                <div
                  key={a.alert_id}
                  className={cn(
                    "flex items-start justify-between gap-3 p-4 bg-muted/40 rounded-xl border border-transparent",
                    "transition-all duration-200 hover:border-border hover:bg-muted/60 hover:shadow-sm",
                    "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                  )}
                  style={{ animationDelay: `${450 + i * 60}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <Badge
                      className={
                        a.severity === "HIGH"
                          ? "bg-destructive text-white"
                          : "bg-warning text-warning-foreground"
                      }
                    >
                      {a.severity}
                    </Badge>
                    <div>
                      <p className="font-semibold text-sm">{a.alert_type}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.description} · {a.created_at ? new Date(a.created_at).toLocaleString() : "just now"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate({ to: "/admin/ai-monitoring" })}
                      disabled={resolvingId !== null}
                      className="hover:border-[#6C63FF]/40 hover:text-[#6C63FF]"
                    >
                      Investigate
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDismiss(a.alert_id)}
                      disabled={resolvingId !== null}
                    >
                      {resolvingId === a.alert_id ? "Dismissing..." : "Dismiss"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </SectionCard>
      )}

      <Button
        disabled={!isSuperAdmin || antiAbuse.isBlocked("seal-results") || sealing}
        className="w-full h-12 bg-muted text-muted-foreground animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
        style={{ animationDelay: "550ms" }}
        onClick={handleSealResults}
      >
        <Lock className="h-4 w-4 mr-2" />
        {sealing
          ? "Sealing & Publishing..."
          : antiAbuse.isBlocked("seal-results")
          ? `Wait ${Math.ceil(antiAbuse.cooldowns["seal-results"]?.remaining || 0)}s`
          : `Seal & Publish Results ${!isSuperAdmin ? "(Super Admin only)" : election?.status === "VOTING_CLOSED" ? "" : "(locked until voting closes)"}`
        }
      </Button>
    </div>
  );
}

function Phase({
  title,
  status,
  tone,
  cta,
  disabled,
  delay,
}: {
  title: string;
  status: string;
  tone: string;
  cta?: string;
  disabled?: boolean;
  delay?: number;
}) {
  return (
    <div
      className={cn(
        "interactive-card bg-card rounded-2xl border border-border/60 p-5",
        "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
      )}
      style={{ animationDelay: `${delay ?? 0}ms` }}
    >
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">{title}</p>
      <Badge className={`${tone} mt-2`}>{status}</Badge>
      {cta && (
        <Button
          size="sm"
          disabled={disabled}
          className="mt-4 bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white hover:opacity-90 border-0 shadow-md"
        >
          {cta}
        </Button>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/dashboard")({ component: Page });
