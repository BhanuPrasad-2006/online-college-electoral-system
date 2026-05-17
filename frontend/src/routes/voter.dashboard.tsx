import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CANDIDATES, KPI as KPI_DATA, NOTIFICATIONS } from "@/lib/mock";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Lock, Users, TrendingUp, AlertCircle, Bell, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/voter/dashboard")({ component: VoterDash });

function VoterDash() {
  const nav = useNavigate();
  const matched = [...CANDIDATES].sort((a, b) => b.match - a.match);

  function handleVoteNowClick() {
    nav({ to: "/voter/vote" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back, Aditya"
        subtitle="Here's what's happening with the election."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={Users}
          label="Total Candidates"
          value={CANDIDATES.length}
          tone="bg-[#6C63FF]/10 text-[#6C63FF]"
          delay={50}
        />
        <StatCard
          icon={TrendingUp}
          label="Voter Turnout"
          value={`${KPI_DATA.turnout}%`}
          tone="bg-success/15 text-success"
          delay={100}
        />
        <StatCard
          icon={AlertCircle}
          label="Your Status"
          value="Not Voted"
          tone="bg-warning/20 text-warning-foreground"
          delay={150}
        />
      </div>

      <div className="flex justify-center items-center w-full py-8 my-4 bg-transparent z-10">
        <button
          onClick={() => handleVoteNowClick()}
          className="px-16 py-5 bg-gradient-to-r from-blue-600 via-[#2563EB] to-[#1F3A6E] hover:from-blue-700 hover:via-blue-700 hover:to-[#172B52] text-white font-bold text-xl rounded-2xl shadow-2xl shadow-blue-600/30 transition-all duration-200 transform hover:scale-105 hover:-translate-y-0.5 block opacity-100 ring-4 ring-blue-500/15"
          style={{ minWidth: "280px", display: "block", color: "#ffffff" }}
        >
          Vote Now
        </button>
      </div>

      <SectionCard delay={200}>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">Candidates</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Based on your declared concerns</p>
          </div>
          <Link
            to="/voter/candidates"
            className="text-sm text-[#6C63FF] font-semibold hover:underline flex items-center gap-1 group"
          >
            View all
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-thin">
          {matched.map((c, i) => {
            const initials = c.name
              .split(" ")
              .map((n) => n[0])
              .join("");
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
                    <AvatarFallback className="bg-gradient-to-br from-[#6C63FF]/15 to-[#1F3A6E]/15 text-[#6C63FF] font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground italic truncate">{c.party}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground/80 mt-3 line-clamp-3">{c.manifesto}</p>
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard delay={450}>
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">Recent Announcements</h2>
        </div>
        <div className="divide-y divide-border">
          {NOTIFICATIONS.slice(0, 4).map((n, i) => (
            <div
              key={n.id}
              className={cn(
                "flex items-center gap-3 py-3 rounded-lg px-2 -mx-2 transition-colors hover:bg-muted/50 cursor-pointer group",
                "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
              )}
              style={{ animationDelay: `${500 + i * 50}ms` }}
            >
              {n.unread && (
                <span className="h-2 w-2 rounded-full bg-[#6C63FF] shrink-0 animate-pulse" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium group-hover:text-[#6C63FF] transition-colors">
                  {n.title}
                </p>
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
