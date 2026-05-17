import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CANDIDATES, KPI as KPI_DATA, NOTIFICATIONS } from "@/lib/mock";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Lock, Users, TrendingUp, CheckCircle2, AlertCircle, Bell, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/voter/dashboard")({ component: VoterDash });

function VoterDash() {
  const nav = useNavigate();
  const matched = [...CANDIDATES].sort((a, b) => b.match - a.match);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold">Welcome back, Aditya</h1>
        <p className="text-sm text-muted-foreground mt-1">Here's what's happening with the election.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI icon={Users} label="Total Candidates" value={String(CANDIDATES.length)} tone="bg-[#6C63FF]/10 text-[#6C63FF]" />
        <KPI icon={TrendingUp} label="Voter Turnout" value={`${KPI_DATA.turnout}%`} tone="bg-success/15 text-success" />
        <KPI icon={AlertCircle} label="Your Status" value="Not Voted" tone="bg-warning/20 text-warning-foreground" />
      </div>

      <section className="bg-card rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#6C63FF]" /> AI Matched Candidates
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Based on your declared concerns</p>
          </div>
          <Link to="/voter/candidates" className="text-sm text-[#6C63FF] font-medium hover:underline">View all →</Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {matched.map((c) => {
            const initials = c.name.split(" ").map((n) => n[0]).join("");
            return (
              <button
                key={c.id}
                onClick={() => nav({ to: "/voter/candidates" })}
                className="min-w-[280px] snap-start bg-card rounded-2xl shadow-sm p-5 text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12"><AvatarFallback className="bg-[#6C63FF]/10 text-[#6C63FF] font-semibold">{initials}</AvatarFallback></Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground italic truncate">{c.party}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground/80 mt-3 line-clamp-3">{c.manifesto}</p>
                <Badge variant="outline" className="mt-3 text-[11px]">AI Match {c.match}%</Badge>
              </button>
            );
          })}
        </div>
      </section>

      <button
        onClick={() => nav({ to: "/voter/vote" })}
        className="w-full py-4 rounded-2xl bg-[#1F3A6E] text-white font-semibold text-base shadow-sm hover:bg-[#1F3A6E]/90 transition-colors flex items-center justify-center gap-2"
      >
        <Lock className="h-5 w-5" /> Cast My Vote — Verify Identity
      </button>

      <section className="bg-card rounded-2xl shadow-sm p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">Recent Announcements</h2>
        </div>
        <div className="divide-y divide-border">
          {NOTIFICATIONS.slice(0, 4).map((n) => (
            <div key={n.id} className="flex items-center gap-3 py-3">
              {n.unread && <span className="h-2 w-2 rounded-full bg-[#6C63FF] shrink-0" />}
              <div className="flex-1">
                <p className="text-sm">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.time}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function KPI({ icon: Icon, label, value, tone }: any) {
  return (
    <div className="bg-card rounded-2xl shadow-sm p-5 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${tone}`}><Icon className="h-6 w-6" /></div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
      </div>
    </div>
  );
}
