import { createFileRoute } from "@tanstack/react-router";
import { KPI, AI_ALERTS } from "@/lib/mock";
import { Users, CheckCircle2, TrendingUp, AlertTriangle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function Page() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Election operations overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={Users} label="Registered Voters" value={KPI.registered.toLocaleString()} tone="bg-[#6C63FF]/10 text-[#6C63FF]" />
        <Stat icon={CheckCircle2} label="Votes Cast" value={KPI.votesCast.toLocaleString()} tone="bg-success/15 text-success" />
        <Stat icon={TrendingUp} label="Turnout" value={`${KPI.turnout}%`} tone="bg-[#1F3A6E]/10 text-[#1F3A6E]" />
        <Stat icon={AlertTriangle} label="Active AI Alerts" value={String(KPI.alerts)} tone="bg-destructive/10 text-destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Phase title="Registration" status="OPEN" tone="bg-success/15 text-success" />
        <Phase title="Voting" status="SCHEDULED" tone="bg-warning/20 text-warning-foreground" cta="Activate" />
        <Phase title="Results" status="PENDING" tone="bg-muted text-muted-foreground" />
      </div>

      <div className="bg-card rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">AI Fraud Alerts</h2>
          <Badge variant="outline">Live</Badge>
        </div>
        <div className="space-y-3">
          {AI_ALERTS.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 p-4 bg-muted/40 rounded-lg">
              <div className="flex items-start gap-3">
                <Badge className={a.severity === "HIGH" ? "bg-destructive text-white" : "bg-warning text-warning-foreground"}>{a.severity}</Badge>
                <div>
                  <p className="font-semibold text-sm">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.detail} · {a.time}</p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline">Investigate</Button>
                <Button size="sm" variant="ghost">Dismiss</Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button disabled className="w-full h-12 bg-muted text-muted-foreground">
        <Lock className="h-4 w-4 mr-2" /> Seal & Publish Results (locked until voting closes)
      </Button>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }: any) {
  return (
    <div className="bg-card rounded-2xl shadow-sm p-5">
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${tone}`}><Icon className="h-5 w-5" /></div>
      <p className="text-xs text-muted-foreground mt-3">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}

function Phase({ title, status, tone, cta }: any) {
  return (
    <div className="bg-card rounded-2xl shadow-sm p-5">
      <p className="text-xs text-muted-foreground uppercase">{title}</p>
      <Badge className={`${tone} mt-2`}>{status}</Badge>
      {cta && <Button size="sm" className="mt-4 bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90">{cta}</Button>}
    </div>
  );
}

export const Route = createFileRoute("/admin/dashboard")({ component: Page });
