import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { PageLoader } from "@/components/PageLoader";
import { useCandidates, useKpi, useNotifications, useVoterProfile } from "@/hooks/use-election-data";
import { Lock, Users, TrendingUp, AlertCircle, Bell, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voter/dashboard")({ component: VoterDash });

function VoterDash() {
  const nav = useNavigate();
  const { data: candidates = [], isPending: loadingCandidates } = useCandidates();
  const { data: kpi, isPending: loadingKpi } = useKpi();
  const { data: notifications = [], isPending: loadingNotifications } = useNotifications();
  const { data: voter } = useVoterProfile();

  if (loadingCandidates || loadingKpi || loadingNotifications) return <PageLoader />;

  const matched = [...candidates].sort((a, b) => b.match - a.match);
  const firstName = voter?.name.split(" ")[0] ?? "Aditya";

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back, ${firstName}`} subtitle="Here's what's happening with the election." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Candidates" value={candidates.length} tone="bg-[#6C63FF]/10 text-[#6C63FF]" delay={50} />
        <StatCard icon={TrendingUp} label="Voter Turnout" value={`${kpi?.turnout ?? 43.4}%`} tone="bg-success/15 text-success" delay={100} />
        <StatCard icon={AlertCircle} label="Your Status" value={voter?.voted ? "Voted" : "Not Voted"} tone="bg-warning/20 text-warning-foreground" delay={150} />
      </div>

      <SectionCard delay={200}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#6C63FF] animate-pulse" /> AI Matched Candidates
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">Based on your declared concerns</p>
          </div>
          <Link to="/voter/candidates" className="text-sm text-[#6C63FF] font-semibold hover:underline flex items-center gap-1 group">
            View all
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-thin">
          {matched.map((c, i) => {
            const initials = c.name.split(" ").map((n) => n[0]).join("");
            return (
              <button
                key={c.id}
                onClick={() => nav({ to: "/voter/candidates" })}
                className={cn(
                  "interactive-card min-w-[280px] snap-start bg-card rounded-2xl border border-border/60 p-5 text-left",
                  "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
                )}
                style={{ animationDelay: `${250 + i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12 ring-2 ring-[#6C63FF]/20">
                    <AvatarFallback className="bg-gradient-to-br from-[#6C63FF]/15 to-[#1F3A6E]/15 text-[#6C63FF] font-semibold">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground italic truncate">{c.party}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground/80 mt-3 line-clamp-3">{c.manifesto}</p>
                <Badge variant="outline" className="mt-3 text-[11px] border-[#6C63FF]/30 text-[#6C63FF]">
                  AI Match {c.match}%
                </Badge>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <button
        onClick={() => nav({ to: "/voter/vote" })}
        className={cn(
          "w-full py-4 rounded-2xl font-semibold text-base text-white",
          "bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] shadow-lg",
          "hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.99]",
          "transition-all duration-300 animate-fade-in-up opacity-0 [animation-fill-mode:forwards] animate-pulse-glow",
          "flex items-center justify-center gap-2 btn-shine",
        )}
        style={{ animationDelay: "400ms" }}
      >
        <Lock className="h-5 w-5" /> Cast My Vote — Verify Identity
      </button>

      <SectionCard delay={450}>
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">Recent Announcements</h2>
        </div>
        <div className="divide-y divide-border">
          {notifications.slice(0, 4).map((n, i) => (
            <div
              key={n.id}
              className={cn(
                "flex items-center gap-3 py-3 rounded-lg px-2 -mx-2 transition-colors hover:bg-muted/50 cursor-pointer group",
                "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
              )}
              style={{ animationDelay: `${500 + i * 50}ms` }}
            >
              {n.unread && <span className="h-2 w-2 rounded-full bg-[#6C63FF] shrink-0 animate-pulse" />}
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-[#6C63FF] transition-colors">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.time}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-[#6C63FF]" />
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
