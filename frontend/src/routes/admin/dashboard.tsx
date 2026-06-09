import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { PageLoader } from "@/components/PageLoader";
import { useAiAlerts, useKpi, useElection } from "@/hooks/use-election-data";
import { useAntiAbuse } from "@/hooks/useAntiAbuse";
import { Users, CheckCircle2, TrendingUp, AlertTriangle, Lock, Shield, Cog, BarChart3, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { resolveAiAlert, publishResults, fetchElectionResults } from "@/lib/api";
import { useEffect } from "react";
import { ElectionCalendar } from "@/components/ElectionCalendar";
import { ElectionTimeline } from "@/components/ElectionTimeline";

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

  const electionStatusColor = election?.status === "RESULTS_PUBLISHED" ? "#16A34A" : election?.status === "VOTING_CLOSED" ? "#D97706" : election?.status === "VOTING_OPEN" ? "#0F8A5F" : "#6B7280";
  const electionStatusLabel = election?.status?.replace(/_/g, " ") || "Loading...";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1600px] w-full items-start">
      {/* ── LEFT: Main content area (2/3 width) ── */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* ── Hero Card ── */}
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0A3B35] via-[#0D5248] to-[#08302A] shadow-xl border border-[#0F8A5F]/20 p-6 md:p-8">
          <div className="absolute inset-0 opacity-[0.05] pointer-events-none">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-[#16A34A] rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
          </div>
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <Badge variant="outline" className="border-white/20 text-[#16A34A] bg-[#16A34A]/10 text-[11px] font-bold py-0.5 px-2.5 rounded-full backdrop-blur-sm">
                  <Shield className="h-3 w-3 mr-1 shrink-0" />
                  Admin Control Center
                </Badge>
                <Badge className="bg-white/15 text-white border-0 text-[11px] font-bold py-0.5 px-2.5 rounded-full">
                  {adminRole?.replace(/_/g, " ") || "Administrator"}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Election Operations Center
              </h1>
              <p className="text-sm text-white/70 max-w-lg leading-relaxed">
                Monitor and manage the election lifecycle — from registration through results.
              </p>
            </div>

            {/* Quick stats in hero */}
            <div className="bg-white/10 border border-white/20 rounded-[20px] p-4 text-center shrink-0 min-w-[170px] backdrop-blur-md">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">Election Status</p>
              <p className="text-sm font-bold text-white mt-1 flex items-center justify-center gap-1.5 capitalize">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: electionStatusColor }} />
                {electionStatusLabel}
              </p>
            </div>
          </div>

          {/* Quick links & actions — redesigned with emerald primary + glass secondary */}
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4 flex-wrap">
            <Button
              size="sm"
              className="btn-shine btn-lift btn-glow btn-icon-slide bg-gradient-to-r from-[#0F8A5F] to-[#16A34A] text-white shadow-lg shadow-[#16A34A]/25 hover:shadow-xl hover:shadow-[#16A34A]/30 hover:-translate-y-0.5 transition-all duration-200 rounded-xl font-bold border-0"
              onClick={() => navigate({ to: "/admin/election" })}
            >
              <Cog className="h-3.5 w-3.5 mr-1.5" />
              Manage Election
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="btn-lift btn-glow btn-icon-slide border-white/20 bg-white/5 backdrop-blur-sm text-white hover:bg-white/15 hover:text-white hover:border-white/30 transition-all duration-200 rounded-xl font-medium"
              onClick={() => navigate({ to: "/admin/results" })}
            >
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
              View Results
            </Button>
          </div>
        </div>

        {/* ── 4 Status Cards Row ── */}
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
            tone="bg-[#16A34A]/10 text-[#16A34A]"
            layout="col"
            delay={100}
          />
          <StatCard
            icon={TrendingUp}
            label="Turnout"
            value={`${kpi.turnout}%`}
            tone="bg-[#0F8A5F]/10 text-[#0F8A5F]"
            layout="col"
            delay={150}
          />
          <StatCard
            icon={AlertTriangle}
            label="Active AI Alerts"
            value={kpi.alerts}
            tone="bg-[#DC2626]/10 text-[#DC2626]"
            layout="col"
            delay={200}
          />
        </div>

        {/* ── Stepper Timeline Roadmap ── */}
        <ElectionTimeline />

        {/* ── Results Summary (Sealed results box) ── */}
        {election?.status === "RESULTS_PUBLISHED" && publishedResults && (
          <SectionCard delay={220} className="border-[#16A34A]/30 bg-[#16A34A]/5 rounded-[24px]">
            <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
              <div>
                <h2 className="text-lg font-bold text-[#102A27] flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-[#16A34A]" />
                  Results Published
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Published: {election.results_published_at ? new Date(election.results_published_at).toLocaleString() : "Just now"}
                </p>
              </div>
              <Badge variant="success">Sealed</Badge>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#4B5563]">Winner Summary</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {publishedResults.results?.map((r: any) => {
                  const winners = r.candidates?.filter((c: any) => c.is_winner === true) || [];
                  const winnerNames = winners.map((w: any) => w.name).join(", ");
                  return (
                    <div key={r.position} className="bg-card p-4 rounded-xl border border-border/50 flex items-center justify-between premium-card">
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase">{r.position}</p>
                        <p className="font-bold text-sm text-[#102A27] mt-1 flex items-center gap-1.5">
                          {winners.length > 0 ? (
                            <>
                              <span className="text-amber-500">🏆</span>
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
                          <p className="text-xs font-mono font-bold text-[#16A34A]">{winners[0].votes} votes</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionCard>
        )}

        {/* ── AI Fraud Alerts ── */}
        {canManageAlerts && (
          <SectionCard delay={250} title="AI Fraud Alerts" className="rounded-[24px]" action={
            <Badge variant="outline" className="border-[#DC2626]/30 text-[#DC2626] bg-[#DC2626]/5 animate-pulse-subtle">
              Live
            </Badge>
          }>
            <div className="space-y-3">
              {activeAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No active AI alerts detected.</p>
              ) : (
                activeAlerts.map((a: any, i: number) => (
                  <div
                    key={a.alert_id}
                    className={cn(
                      "flex items-start justify-between gap-3 p-4 bg-gray-50/50 rounded-xl border border-[#E6ECE9]",
                      "transition-all duration-150 hover:border-[#0F8A5F]/20 hover:bg-gray-50",
                      "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
                    )}
                    style={{ animationDelay: `${300 + i * 60}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      <Badge
                        variant={a.severity === "HIGH" ? "destructive" : "warning"}
                      >
                        {a.severity}
                      </Badge>
                      <div>
                        <p className="font-semibold text-sm text-[#102A27]">{a.alert_type}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
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
                        className="rounded-lg text-xs"
                      >
                        Investigate
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDismiss(a.alert_id)}
                        disabled={resolvingId !== null}
                        className="rounded-lg text-xs"
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
      </div>

      {/* ── RIGHT: Side widgets (1/3 width) ── */}
      <div className="space-y-6">
        {/* Dynamic Election Calendar Component */}
        <ElectionCalendar />

        {/* Quick Phase Panel */}
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm space-y-4">
          <p className="text-sm font-bold text-[#102A27]">Phases status</p>
          <div className="grid grid-cols-1 gap-3">
            <Phase title="Registration" status="OPEN" tone="bg-[#16A34A]/10 text-[#16A34A]" delay={50} />
            <Phase
              title="Voting"
              status="SCHEDULED"
              tone="bg-[#D97706]/10 text-[#D97706]"
              cta="Activate"
              disabled={!canManageElection}
              delay={100}
            />
            <Phase title="Results" status="PENDING" tone="bg-gray-100 text-gray-500" delay={150} />
          </div>
        </div>

        {/* Seal and Publish Results CTA */}
        <Button
          disabled={!isSuperAdmin || antiAbuse.isBlocked("seal-results") || sealing}
          variant="outline"
          className="w-full h-12 border-dashed rounded-[20px] font-bold text-xs"
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
        "premium-card bg-card rounded-xl border border-border/60 p-5 shadow-sm",
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
        >
          {cta}
        </Button>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/dashboard")({ component: Page });
