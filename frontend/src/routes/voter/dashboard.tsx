import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useCandidates, useVoterProfile, useKpi, useCurrentPhase } from "@/hooks/use-election-data";
import { useNotifications } from "@/context/NotificationStore";
import { PageLoader } from "@/components/PageLoader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { CheckCircle2, Users, TrendingUp, AlertCircle, Bell, ChevronRight, Lock, Clock, UserPlus, Vote, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
// ── helpers for election phase ─────────────────────────────────
function pad2(n: number) { return String(n).padStart(2, "0"); }
function fmtCountdown(ms: number) {
  const t = Math.max(0, ms);
  const d = Math.floor(t / 86_400_000);
  const h = Math.floor((t / 3_600_000) % 24);
  const m = Math.floor((t / 60_000) % 60);
  const s = Math.floor((t / 1_000) % 60);
  return d > 0
    ? `${pad2(d)}d ${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`
    : `${pad2(h)}h ${pad2(m)}m ${pad2(s)}s`;
}

export const Route = createFileRoute("/voter/dashboard")({ component: VoterDash });

function VoterDash() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const { data: voter, isPending } = useVoterProfile();
  const { data: candidates = [] } = useCandidates();
  const { data: kpi } = useKpi();
  const { data: phaseData } = useCurrentPhase();
  const { notifications = [] } = useNotifications();
  const [timeLeft, setTimeLeft] = useState<string>("");

  const isRegOpen  = phaseData?.phase === "registration_open";
  const isVoteOpen = phaseData?.phase === "voting_open";
  const regOpensSoon = phaseData?.phase === "pre_registration";
  const voteOpensSoon = phaseData?.phase === "registration_closed" || phaseData?.phase === "campaign_period";
  const isPaused = phaseData?.is_paused;

  const remainingTimeStr = phaseData?.remaining_time || "";

  useEffect(() => {
    // Decode JWT from sessionStorage and start the countdown timer
    const token = sessionStorage.getItem("collegevote-token");
    if (!token) return;
    const jwtToken = token;

    function updateTimer() {
      try {
        const base64Url = jwtToken.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(window.atob(base64));
        const exp = payload.exp;
        if (!exp) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const diff = exp - nowSec;

        if (diff <= 0) {
          setTimeLeft("Expired");
          logout();
          nav({ to: "/" });
          toast.error("Session expired. Please login again.");
        } else {
          const minutes = Math.floor(diff / 60);
          const seconds = diff % 60;
          setTimeLeft(`${minutes}m ${seconds}s`);
        }
      } catch (e) {
        console.error("Failed to decode token for timer", e);
      }
    }

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [logout, nav]);

  if (isPending || !voter) return <PageLoader />;
  
  // Show only approved candidates
  const approvedCandidates = candidates.filter(
    (c) => (c.status || "").toLowerCase() === "approved"
  );
  const matched = [...approvedCandidates].sort((a, b) => (b.match || 75) - (a.match || 75));
  const firstName = voter.name.split(" ")[0];

  const hasVoted = voter.voted || (typeof localStorage !== "undefined" && localStorage.getItem("collegevote-has-voted") === "true");
  const votePermission = voter.vote_permission;

  function handleVoteNowClick() {
    if (!hasVoted && votePermission) nav({ to: "/voter/vote" });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <PageHeader
          title={`Welcome back, ${firstName}`}
          subtitle="Here's what's happening with the election."
        />
        {timeLeft && (
          <div className="flex items-center gap-2 px-4 py-2 bg-card border border-border/60 rounded-2xl shadow-sm text-sm">
            <Clock className="h-4 w-4 text-[#6C63FF]" />
            <span className="text-muted-foreground">Session Ends:</span>
            <span className="font-mono font-semibold text-destructive">{timeLeft}</span>
          </div>
        )}
      </div>

      {/* ── Real-time Election Phase Banner ── */}

      {/* Registration OPEN */}
      {!isPaused && isRegOpen && (
        <div className="relative overflow-hidden rounded-2xl border border-[#1F3A6E]/20 bg-gradient-to-r from-[#1F3A6E]/10 to-[#6C63FF]/5 shadow-sm animate-fade-in mb-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-[#1F3A6E]" />
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 z-10">
              <h3 className="text-lg font-bold text-[#1F3A6E] flex items-center gap-2">
                <Users className="h-5 w-5 text-[#6C63FF]" />
                Candidate Registration is Open!
              </h3>
              <p className="text-sm text-foreground/80 max-w-xl">
                {voter.vote_permission 
                    ? <>You are eligible to register as a candidate — closes in <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span></>
                    : <>Registration is open — closes in <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span> — contact admin for permission</>}
              </p>
            </div>
            {voter.vote_permission && (
              <Link to="/candidate/register" className="shrink-0 z-10">
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1F3A6E] text-white text-sm font-semibold hover:bg-[#1F3A6E]/90 transition-all shadow-md">
                  Register as Candidate
                  <ChevronRight className="h-4 w-4" />
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Voting OPEN */}
      {!isPaused && isVoteOpen && (
        <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/10 to-indigo-500/5 shadow-sm animate-fade-in mb-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-violet-500" />
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 z-10">
              <h3 className="text-lg font-bold text-violet-700 flex items-center gap-2">
                <Vote className="h-5 w-5" />
                Voting is Live!
              </h3>
              <p className="text-sm text-foreground/80 max-w-xl">
                Cast your ballot securely — closes in <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span>
              </p>
            </div>
            {!hasVoted && (
              <button onClick={() => nav({ to: "/voter/vote" })} className="shrink-0 z-10">
                <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-all shadow-md animate-pulse">
                  <Sparkles className="h-4 w-4" />
                  Vote Now
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Registration OPENS SOON */}
      {!isPaused && regOpensSoon && remainingTimeStr && (
        <div className="relative overflow-hidden rounded-2xl border border-[#6C63FF]/20 bg-gradient-to-r from-[#6C63FF]/10 to-transparent shadow-sm animate-fade-in mb-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-[#6C63FF]" />
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 z-10">
              <h3 className="text-lg font-bold text-[#6C63FF] flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Registration Opens Soon
              </h3>
              <p className="text-sm text-foreground/80 max-w-xl">
                Candidate registration begins in <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Voting OPENS SOON */}
      {!isPaused && voteOpensSoon && remainingTimeStr && !isRegOpen && (
        <div className="relative overflow-hidden rounded-2xl border border-[#6C63FF]/20 bg-gradient-to-r from-[#6C63FF]/10 to-transparent shadow-sm animate-fade-in mb-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-[#6C63FF]" />
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 z-10">
              <h3 className="text-lg font-bold text-[#6C63FF] flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Voting Opens Soon
              </h3>
              <p className="text-sm text-foreground/80 max-w-xl">
                The polls will open in <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Clickable Total Candidates card */}
        <button onClick={() => nav({ to: "/voter/candidates" })} className="text-left group w-full">
          <StatCard
            icon={Users}
            label="Total Candidates"
            value={approvedCandidates.length}
            tone="bg-[#6C63FF]/10 text-[#6C63FF]"
            delay={50}
          />
        </button>
        <StatCard
          icon={TrendingUp}
          label="Voter Turnout"
          value={`${kpi?.turnout || 0}%`}
          tone="bg-success/15 text-success"
          delay={100}
        />
        <StatCard
          icon={hasVoted ? CheckCircle2 : (votePermission ? AlertCircle : Lock)}
          label="Your Status"
          value={hasVoted ? "Voted ✓" : (votePermission ? "Authorized to Vote" : "Pending Admin Permission")}
          tone={hasVoted ? "bg-success/15 text-success" : (votePermission ? "bg-[#6C63FF]/10 text-[#6C63FF]" : "bg-warning/20 text-warning-foreground")}
          delay={150}
        />
      </div>



      <div className="flex justify-center items-center w-full py-8 my-4 bg-transparent z-10">
        {hasVoted ? (
          <div
            className="flex items-center gap-3 px-16 py-5 bg-success/15 border-2 border-success/40 text-success font-bold text-xl rounded-2xl shadow-md cursor-not-allowed select-none animate-in fade-in duration-300"
            style={{ minWidth: "280px", justifyContent: "center" }}
          >
            <CheckCircle2 className="h-6 w-6 text-success" />
            Already Voted
          </div>
        ) : !votePermission ? (
          <div className="w-full max-w-lg bg-warning/10 border border-warning/30 rounded-2xl p-6 text-center space-y-3 animate-in zoom-in duration-300">
            <div className="mx-auto h-12 w-12 rounded-full bg-warning/20 flex items-center justify-center">
              <Lock className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="font-bold text-warning-foreground text-lg">Voting Blocked</p>
              <p className="text-sm text-muted-foreground mt-1">
                The election admin has not authorized your student profile to vote yet. Please wait for approval or contact the election coordinator.
              </p>
            </div>
            {timeLeft && (
              <p className="text-xs text-destructive font-semibold flex items-center justify-center gap-1">
                <Clock className="h-3 w-3" />
                Remaining login time: {timeLeft}
              </p>
            )}
          </div>
        ) : isVoteOpen ? (
          <button
            onClick={handleVoteNowClick}
            className="px-16 py-5 bg-gradient-to-r from-blue-600 via-[#2563EB] to-[#1F3A6E] hover:from-blue-700 hover:via-blue-700 hover:to-[#172B52] text-white font-bold text-xl rounded-2xl shadow-2xl shadow-blue-600/30 transition-all duration-200 transform hover:scale-105 hover:-translate-y-0.5 block opacity-100 ring-4 ring-blue-500/15"
            style={{ minWidth: "280px", display: "block", color: "#ffffff" }}
          >
            Vote Now
          </button>
        ) : (
          <div
            className="flex items-center gap-3 px-16 py-5 bg-muted/50 border-2 border-border/50 text-muted-foreground font-bold text-xl rounded-2xl shadow-sm cursor-not-allowed select-none transition-all duration-300"
            style={{ minWidth: "280px", justifyContent: "center" }}
          >
            <Clock className="h-6 w-6 opacity-70" />
            {voteOpensSoon ? "Voting Opens Soon" : "Voting Closed"}
          </div>
        )}
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
            const dispName = c.full_name || c.name || "Candidate";
            const initials = dispName
              .split(" ")
              .map((n: string) => n[0] || "")
              .join("");
            const partyName = c.party || c.party_symbol_url || "Independent";
            return (
              <button
                key={c.candidate_id}
                onClick={() => nav({ to: "/voter/candidates", search: { open: c.candidate_id } })}
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
                    <p className="font-semibold truncate">{dispName}</p>
                    <p className="text-xs text-muted-foreground italic truncate">{partyName}</p>
                  </div>
                </div>
                <p className="text-sm text-foreground/80 mt-3 line-clamp-3">
                  {c.manifesto || "Manifesto pending admin approval."}
                </p>
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
          {notifications.slice(0, 4).map((n: any, i: number) => (
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
