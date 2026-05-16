import { createFileRoute } from "@tanstack/react-router";
import { PageLoader } from "@/components/PageLoader";
import { useAiAlerts, useKpi } from "@/hooks/use-election-data";
import { Users, CheckCircle2, TrendingUp, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { cn } from "@/lib/utils";

function Page() {
  const { data: kpi, isPending: loadingKpi } = useKpi();
  const { data: aiAlerts = [], isPending: loadingAlerts } = useAiAlerts();

  if (loadingKpi || loadingAlerts || !kpi) return <PageLoader />;

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Dashboard" subtitle="Election operations overview" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Registered Voters" value={kpi.registered.toLocaleString()} layout="col" delay={50} />
        <StatCard icon={CheckCircle2} label="Votes Cast" value={kpi.votesCast.toLocaleString()} tone="bg-success/15 text-success" layout="col" delay={100} />
        <StatCard icon={TrendingUp} label="Turnout" value={`${kpi.turnout}%`} tone="bg-[#1F3A6E]/10 text-[#1F3A6E]" layout="col" delay={150} />
        <StatCard icon={AlertTriangle} label="Active AI Alerts" value={kpi.alerts} tone="bg-destructive/10 text-destructive" layout="col" delay={200} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Phase title="Registration" status="OPEN" tone="bg-success/15 text-success" delay={250} />
        <Phase title="Voting" status="SCHEDULED" tone="bg-warning/20 text-warning-foreground" cta="Activate" delay={300} />
        <Phase title="Results" status="PENDING" tone="bg-muted text-muted-foreground" delay={350} />
      </div>

      <SectionCard delay={400}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">AI Fraud Alerts</h2>
          <Badge variant="outline" className="border-destructive/40 text-destructive animate-pulse">Live</Badge>
        </div>
        <div className="space-y-3">
          {aiAlerts.map((a, i) => (
            <div
              key={a.id}
              className={cn(
                "flex items-start justify-between gap-3 p-4 bg-muted/40 rounded-xl border border-transparent",
                "transition-all duration-200 hover:border-border hover:bg-muted/60 hover:shadow-sm",
                "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
              )}
              style={{ animationDelay: `${450 + i * 60}ms` }}
            >
              <div className="flex items-start gap-3">
                <Badge className={a.severity === "HIGH" ? "bg-destructive text-white" : "bg-warning text-warning-foreground"}>
                  {a.severity}
                </Badge>
                <div>
                  <p className="font-semibold text-sm">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.detail} · {a.time}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="hover:border-[#6C63FF]/40 hover:text-[#6C63FF]">Investigate</Button>
                <Button size="sm" variant="ghost">Dismiss</Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <Button
        disabled
        className="w-full h-12 bg-muted text-muted-foreground animate-fade-in-up opacity-0 [animation-fill-mode:forwards]"
        style={{ animationDelay: "550ms" }}
      >
        <Lock className="h-4 w-4 mr-2" /> Seal & Publish Results (locked until voting closes)
      </Button>
    </div>
  );
}

function Phase({ title, status, tone, cta, delay }: { title: string; status: string; tone: string; cta?: string; delay?: number }) {
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
        <Button size="sm" className="mt-4 bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white hover:opacity-90 border-0 shadow-md">
          {cta}
        </Button>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/dashboard")({ component: Page });
