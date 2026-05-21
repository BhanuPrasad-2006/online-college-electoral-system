import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { KPI as KPI_DATA, NOTIFICATIONS } from "@/lib/mock";
import { useCandidates, useVoterProfile } from "@/hooks/use-election-data";
import { PageLoader } from "@/components/PageLoader";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { CheckCircle2, Users, TrendingUp, AlertCircle, Bell, ChevronRight, Lock, Clock, UserPlus, Vote, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { fetchCurrentElection } from "@/lib/api";

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
  const { data: candidates = [], isPending: isCandidatesPending } = useCandidates();
  const [timeLeft, setTimeLeft] = useState<string>("");

  // ── Real-time election phase state ─────────────────────────
  const [election, setElection] = useState<any>(null);
  const [now, setNow] = useState(Date.now());

  const loadElection = useCallback(async () => {
    try { setElection(await fetchCurrentElection()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadElection();
    const id = setInterval(loadElection, 15_000);
    return () => clearInterval(id);
  }, [loadElection]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Derive phase from real election timestamps
  const regStart  = election?.registration_start ? new Date(election.registration_start).getTime() : null;
  const regEnd    = election?.registration_end   ? new Date(election.registration_end).getTime()   : null;
  const votStart  = election?.voting_start        ? new Date(election.voting_start).getTime()        : null;
  const votEnd    = election?.voting_end          ? new Date(election.voting_end).getTime()          : null;

  const isRegOpen  = !!regStart && !!regEnd  && now >= regStart && now < regEnd;
  const isVoteOpen = !!votStart && !!votEnd  && now >= votStart && now < votEnd;
  const regOpensSoon = !!regStart && now < regStart;
  const voteOpensSoon = !!votStart && !isVoteOpen && now < votStart;

  const regTimeLeft  = isRegOpen  && regEnd  ? fmtCountdown(regEnd  - now) : null;
  const voteTimeLeft = isVoteOpen && votEnd  ? fmtCountdown(votEnd  - now) : null;
  const regSoonLeft  = regOpensSoon  && regStart ? fmtCountdown(regStart - now) : null;
  const voteSoonLeft = voteOpensSoon && votStart ? fmtCountdown(votStart - now) : null;

  useEffect(() => {
    // Decode JWT from sessionStorage and start the countdown timer
    const token = sessionStorage.getItem("collegevote-token");
    if (!token) return;

    function updateTimer() {
      try {
        const base64Url = token.split(".")[1];
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

  if (isPending || isCandidatesPending || !voter) return <PageLoader />;
  
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
      {isRegOpen && (
        <div className="relative overflow-hidden rounded-2xl border border-[#6C63FF]/30 bg-gradient-to-r from-[#1F3A6E]/40 via-[#6C63FF]/10 to-[#1F3A6E]/30 p-5 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#6C63FF]/10 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-4 flex-wrap relative z-10">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#6C63FF]/20 flex items-center justify-center shrink-0">
                <UserPlus className="h-5 w-5 text-[#6C63FF]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[#6C63FF]/20 text-[#6C63FF] text-[10px] font-bold rounded-full tracking-widest">OPEN NOW</span>
                  <span className="h-2 w-2 rounded-full bg-[#6C63FF] animate-pulse" />
                </div>
                <p className="font-bold text-base text-foreground mt-1">Candidate Registration is Open!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {votePermission
                    ? <>You are eligible to register as a candidate · closes in <span className="font-mono font-bold text-[#6C63FF]">{regTimeLeft}</span></>
                    : <>Registration is open · closes in <span className="font-mono font-bold text-[#6C63FF]">{regTimeLeft}</span> · contact admin for permission</>}
                </p>
              </div>
            </div>
            {votePermission && (
              <button
                onClick={() => nav({ to: "/candidate/register" })}
                className="px-5 py-2.5 bg-[#1F3A6E] hover:bg-[#2a4d8f] text-white text-sm font-bold rounded-xl transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#1F3A6E]/40 border border-[#6C63FF]/30 shrink-0"
              >
                Register as Candidate →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Voting OPEN */}
      {isVoteOpen && (
        <div className="relative overflow-hidden rounded-2xl border border-[#1F3A6E]/50 bg-gradient-to-r from-[#1F3A6E]/50 via-[#6C63FF]/10 to-[#1F3A6E]/40 p-5 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#6C63FF]/10 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-4 flex-wrap relative z-10">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-[#6C63FF]/20 flex items-center justify-center shrink-0">
                <Vote className="h-5 w-5 text-[#6C63FF]" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-[#6C63FF]/20 text-[#6C63FF] text-[10px] font-bold rounded-full tracking-widest">VOTING OPEN</span>
                  <span className="h-2 w-2 rounded-full bg-[#6C63FF] animate-pulse" />
                </div>
                <p className="font-bold text-base text-foreground mt-1">Voting is Now Open!</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cast your ballot securely · closes in <span className="font-mono font-bold text-[#6C63FF]">{voteTimeLeft}</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => nav({ to: "/voter/vote" })}
              className="px-5 py-2.5 bg-[#1F3A6E] hover:bg-[#2a4d8f] text-white text-sm font-bold rounded-xl transition-all hover:scale-105 hover:shadow-lg hover:shadow-[#1F3A6E]/40 border border-[#6C63FF]/30 shrink-0"
            >
              Cast Your Vote →
            </button>
          </div>
        </div>
      )}

      {/* Registration opening soon */}
      {regOpensSoon && regSoonLeft && (
        <div className="flex items-center gap-3 rounded-xl border border-[#6C63FF]/20 bg-[#6C63FF]/5 px-4 py-3 text-sm animate-in fade-in duration-500">
          <Sparkles className="h-4 w-4 text-[#6C63FF] shrink-0" />
          <span className="text-foreground font-medium">Candidate registration opens in </span>
          <span className="font-mono font-bold text-[#6C63FF]">{regSoonLeft}</span>
          {election?.title && <span className="text-muted-foreground ml-1 hidden sm:inline">· {election.title}</span>}
        </div>
      )}

      {/* Voting opening soon */}
      {voteOpensSoon && voteSoonLeft && !isRegOpen && (
        <div className="flex items-center gap-3 rounded-xl border border-[#1F3A6E]/40 bg-[#1F3A6E]/10 px-4 py-3 text-sm animate-in fade-in duration-500">
          <Clock className="h-4 w-4 text-[#6C63FF] shrink-0" />
          <span className="text-foreground font-medium">Voting opens in </span>
          <span className="font-mono font-bold text-[#6C63FF]">{voteSoonLeft}</span>
          {election?.title && <span className="text-muted-foreground ml-1 hidden sm:inline">· {election.title}</span>}
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
          value={`${KPI_DATA.turnout}%`}
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
              .map((n) => n[0] || "")
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
