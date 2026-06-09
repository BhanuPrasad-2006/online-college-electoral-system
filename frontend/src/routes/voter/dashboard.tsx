import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useElection, useCandidates, useVoterProfile, useKpi, useCurrentPhase } from "@/hooks/use-election-data";
import { useNotifications } from "@/context/NotificationStore";
import { PageLoader } from "@/components/PageLoader";
import { SectionCard } from "@/components/ui/page-header";
import {
  Users,
  TrendingUp,
  ChevronRight,
  Lock,
  Clock,
  Vote,
  ShieldCheck,
  Megaphone,
  UserCheck,
  ScanFace,
  Calendar,
  Shield,
  Music,
  Briefcase,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { fetchMyPartyInvitations, acceptPartyInvitation, rejectPartyInvitation } from "@/lib/api";
import { useAntiAbuse } from "@/hooks/useAntiAbuse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ElectionCalendar } from "@/components/ElectionCalendar";
import { ElectionTimeline } from "@/components/ElectionTimeline";

// ── Election phase helpers ─────────────────────────────────────
function reconcilePhase(livePhase: any) {
  if (livePhase?.phase) return livePhase;
  return { phase: "unknown", remaining_time: "" };
}

export const Route = createFileRoute("/voter/dashboard")({ component: VoterDash });

function VoterDash() {
  const nav = useNavigate();
  const { logout } = useAuth();
  const { data: voter, isPending } = useVoterProfile();
  const { data: candidates = [] } = useCandidates();
  const { data: kpi } = useKpi();
  const { data: election } = useElection();
  const { data: phaseData } = useCurrentPhase();
  const { notifications = [] } = useNotifications();
  const antiAbuse = useAntiAbuse();
  const qc = useQueryClient();

  // Party invitations query
  const { data: partyInvitations = [] } = useQuery({
    queryKey: ["voter-party-invitations"],
    queryFn: fetchMyPartyInvitations,
    staleTime: 60_000,
    retry: 1,
  });

  const pendingInvitations = (partyInvitations as any[]).filter(
    (i) => (i.status || "").toLowerCase() === "pending",
  );

  const acceptInvitationMutation = useMutation({
    mutationFn: acceptPartyInvitation,
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["voter-party-invitations"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to accept invitation"),
  });

  const rejectInvitationMutation = useMutation({
    mutationFn: rejectPartyInvitation,
    onSuccess: () => {
      toast.success("Invitation rejected.");
      qc.invalidateQueries({ queryKey: ["voter-party-invitations"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to reject invitation"),
  });

  // Reconcile and setup parameters
  const effectivePhase = reconcilePhase(phaseData);
  const isVoteOpen = effectivePhase?.phase === "voting_open";
  // ── Live countdown driven by election voting_end timestamp ────────────
  const [countdown, setCountdown] = useState<{ days: string; hours: string; minutes: string; seconds: string } | null>(null);
  const [countdownLabel, setCountdownLabel] = useState<string>("Voting Ends In");

  useEffect(() => {
    if (!election) {
      setCountdown(null);
      return;
    }

    const nowMs = Date.now();
    const votingEnd = election.voting_end ?? election.votingEnd;
    const electionStatus = (election.status || "").toUpperCase();

    if (electionStatus === "RESULTS_PUBLISHED") {
      setCountdown(null);
      setCountdownLabel("Results Published");
      return;
    }

    if (!isVoteOpen || !votingEnd) {
      setCountdown(null);
      setCountdownLabel("Voting Closed");
      return;
    }

    const endTime = new Date(votingEnd).getTime();

    function update() {
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        setCountdown(null);
        setCountdownLabel("Voting Closed");
        return;
      }

      const days = Math.floor(diff / 86_400_000);
      const hours = Math.floor((diff % 86_400_000) / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);

      setCountdown({
        days: String(days).padStart(2, "0"),
        hours: String(hours).padStart(2, "0"),
        minutes: String(minutes).padStart(2, "0"),
        seconds: String(seconds).padStart(2, "0"),
      });
      setCountdownLabel("Voting Ends In");
    }

    update();
    const interval = setInterval(update, 1_000);
    return () => clearInterval(interval);
  }, [election, isVoteOpen]);

  const positionsWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    candidates.forEach((c: any) => {
      if (c.position) {
        counts[c.position] = (counts[c.position] || 0) + 1;
      }
    });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [candidates]);

  useEffect(() => {
    const token = sessionStorage.getItem("collegevote-token");
    if (!token) return;
    const jwtToken = token;

    function checkSession() {
      try {
        const base64Url = jwtToken.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(window.atob(base64));
        const exp = payload.exp;
        if (!exp) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const diff = exp - nowSec;

        if (diff <= 0) {
          logout();
          nav({ to: "/" });
          toast.error("Session expired. Please login again.");
        }
      } catch (e) {
        console.error("Failed to decode token for session check", e);
      }
    }

    checkSession();
    const interval = setInterval(checkSession, 30000); // check every 30s instead of 1s (no UI timer to update)
    return () => clearInterval(interval);
  }, [logout, nav]);

  // Early return for loaders AFTER all hooks have executed unconditionally
  if (isPending || !voter) return <PageLoader />;

  const firstName = voter.name.split(" ")[0];

  const hasVoted = Boolean(
    voter.voted ||
    (typeof localStorage !== "undefined" &&
      localStorage.getItem("collegevote-has-voted") === "true")
  );
  const votePermission = voter.vote_permission;

  function handleVoteNowClick() {
    if (antiAbuse.isBlocked("go-vote")) return;
    if (!hasVoted && votePermission) nav({ to: "/voter/vote" });
    antiAbuse.startCooldown("go-vote", 2);
  }

  // Dynamic style helper for contested positions list
  const getPositionStyle = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("president") && !lower.includes("vice")) {
      return {
        icon: <Users className="h-4 w-4" />,
        bg: "bg-green-100 text-green-700",
      };
    }
    if (lower.includes("vice")) {
      return {
        icon: <UserCheck className="h-4 w-4" />,
        bg: "bg-amber-100 text-amber-700",
      };
    }
    if (lower.includes("cultural") || lower.includes("media") || lower.includes("art")) {
      return {
        icon: <Music className="h-4 w-4" />,
        bg: "bg-purple-100 text-purple-700",
      };
    }
    if (lower.includes("sport") || lower.includes("game") || lower.includes("gym")) {
      return {
        icon: <Trophy className="h-4 w-4" />,
        bg: "bg-orange-100 text-orange-700",
      };
    }
    return {
      icon: <UserCheck className="h-4 w-4" />,
      bg: "bg-[#0F8A5F]/10 text-[#0F8A5F]",
    };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-[1600px] w-full items-start">
      {/* ── LEFT: Main content area (2/3 width) ── */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* ── Hero Card ── */}
        <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#052F28] via-[#084137] to-[#03211C] shadow-xl border border-[#0F8A5F]/20 p-6 md:p-8">
          <div className="absolute inset-0 opacity-[0.12] pointer-events-none">
            <svg className="absolute right-4 bottom-0 h-[95%] w-auto text-white" viewBox="0 0 400 300" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20,280 L380,280 M40,275 L360,275 M60,270 L340,270 M80,265 L320,265 M120,265 L120,260 L280,260 L280,265" />
              <path d="M150,260 L150,245 L250,245 L250,260" />
              <line x1="150" y1="250" x2="250" y2="250" />
              <line x1="150" y1="255" x2="250" y2="255" />
              <rect x="50" y="190" width="300" height="75" rx="1" />
              <line x1="60" y1="190" x2="60" y2="265" />
              <line x1="80" y1="190" x2="80" y2="265" />
              <line x1="100" y1="190" x2="100" y2="265" />
              <line x1="120" y1="190" x2="120" y2="265" />
              <line x1="140" y1="190" x2="140" y2="265" />
              <line x1="260" y1="190" x2="260" y2="265" />
              <line x1="280" y1="190" x2="280" y2="265" />
              <line x1="300" y1="190" x2="300" y2="265" />
              <line x1="320" y1="190" x2="320" y2="265" />
              <line x1="340" y1="190" x2="340" y2="265" />
              <polygon points="130,190 270,190 200,165" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <line x1="145" y1="190" x2="145" y2="245" />
              <line x1="165" y1="190" x2="165" y2="245" />
              <line x1="185" y1="190" x2="185" y2="245" />
              <line x1="215" y1="190" x2="215" y2="245" />
              <line x1="235" y1="190" x2="235" y2="245" />
              <line x1="255" y1="190" x2="255" y2="245" />
              <circle cx="200" cy="180" r="4" />
              <rect x="150" y="115" width="100" height="50" rx="1" />
              <line x1="160" y1="115" x2="160" y2="165" />
              <line x1="170" y1="115" x2="170" y2="165" />
              <line x1="180" y1="115" x2="180" y2="165" />
              <line x1="190" y1="115" x2="190" y2="165" />
              <line x1="210" y1="115" x2="210" y2="165" />
              <line x1="220" y1="115" x2="220" y2="165" />
              <line x1="230" y1="115" x2="230" y2="165" />
              <line x1="240" y1="115" x2="240" y2="165" />
              <path d="M162,145 C162,135 168,135 168,145 L168,165" />
              <path d="M182,145 C182,135 188,135 188,145 L188,165" />
              <path d="M212,145 C212,135 218,135 218,145 L218,165" />
              <path d="M232,145 C232,135 238,135 238,145 L238,165" />
              <path d="M152,115 C152,60 248,60 248,115 Z" />
              <path d="M165,115 C175,70 190,65 200,60" />
              <path d="M180,115 C187,80 195,65 200,60" />
              <path d="M235,115 C225,70 210,65 200,60" />
              <path d="M220,115 C213,80 205,65 200,60" />
              <rect x="190" y="40" width="20" height="20" rx="1" />
              <line x1="195" y1="40" x2="195" y2="60" />
              <line x1="205" y1="40" x2="205" y2="60" />
              <path d="M192,40 C192,28 208,28 208,40 Z" />
              <line x1="200" y1="28" x2="200" y2="10" />
              <circle cx="200" cy="8" r="2" fill="currentColor" />
              <path d="M10,280 C10,240 35,230 45,260 C40,220 70,210 75,250 C70,240 85,240 90,265" />
              <path d="M390,280 C390,240 365,230 355,260 C360,220 330,210 325,250 C330,240 315,240 310,265" />
              <line x1="50" y1="265" x2="350" y2="265" />
            </svg>
          </div>
          
          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6 z-10">
            <div className="space-y-3">
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-white/80 text-[10px] font-bold tracking-wider leading-none">
                College Election 2026
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Welcome back, {firstName}! 👋
              </h1>
              <p className="text-sm text-white/70 max-w-lg leading-relaxed">
                Your voice matters. Your vote counts.
              </p>
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <Badge variant="outline" className="border-white/20 text-[#16A34A] bg-[#16A34A]/10 text-[11px] font-bold py-0.5 px-2.5 rounded-full backdrop-blur-sm">
                  <ShieldCheck className="h-3 w-3 mr-1 shrink-0" />
                  Verified Voter
                </Badge>
                {hasVoted ? (
                  <Badge className="bg-[#16A34A] text-white border-0 text-[11px] font-bold py-0.5 px-2.5 rounded-full">✓ Ballot Cast</Badge>
                ) : votePermission ? (
                  <Badge className="bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20 text-[11px] font-bold py-0.5 px-2.5 rounded-full backdrop-blur-sm">
                    <UserCheck className="h-3 w-3 mr-1 shrink-0" />
                    Eligible to Vote
                  </Badge>
                ) : (
                  <Badge className="bg-[#D97706] text-white border-0 text-[11px] font-bold py-0.5 px-2.5 rounded-full">Authorization Pending</Badge>
                )}
              </div>
            </div>

            {/* Countdown Box — live every-second countdown from election voting_end */}
            {countdown ? (
              <div className="bg-black/20 backdrop-blur-md rounded-xl p-4 border border-white/10 shrink-0 min-w-[220px]">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60 mb-2 text-center md:text-left">{countdownLabel}</p>
                <div className="grid grid-cols-4 gap-2 text-center text-white">
                  <div>
                    <p className="text-2xl font-extrabold leading-none">{countdown.days}</p>
                    <p className="text-[9px] text-white/45 font-medium mt-1 uppercase tracking-wider">Days</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold leading-none">{countdown.hours}</p>
                    <p className="text-[9px] text-white/45 font-medium mt-1 uppercase tracking-wider">Hours</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold leading-none">{countdown.minutes}</p>
                    <p className="text-[9px] text-white/45 font-medium mt-1 uppercase tracking-wider">Mins</p>
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold leading-none">{countdown.seconds}</p>
                    <p className="text-[9px] text-white/45 font-medium mt-1 uppercase tracking-wider">Secs</p>
                  </div>
                </div>
              </div>
            ) : countdownLabel === "Results Published" ? (
              <div className="bg-amber-500/20 backdrop-blur-md rounded-xl p-4 border border-amber-400/30 shrink-0 min-w-[170px] text-center">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300 mb-1">🏆 Results Published</p>
                <p className="text-xs text-white/70">Check the results page</p>
              </div>
            ) : (
              <div className="bg-white/10 border border-white/20 rounded-[20px] p-4 text-center shrink-0 min-w-[170px] backdrop-blur-md">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">{countdownLabel}</p>
                <p className="text-sm font-bold text-white/80 mt-1">Check back later</p>
              </div>
            )}
          </div>

          {/* Quick action buttons — consistent with emerald primary + glass secondary */}
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4 flex-wrap">
            <Button
              size="sm"
              className="btn-shine btn-lift btn-glow btn-icon-slide bg-gradient-to-r from-[#0F8A5F] to-[#16A34A] text-white shadow-lg shadow-[#16A34A]/25 hover:shadow-xl hover:shadow-[#16A34A]/30 hover:-translate-y-0.5 transition-all duration-200 rounded-xl font-bold border-0"
              onClick={handleVoteNowClick}
              disabled={!votePermission || hasVoted}
              title={hasVoted ? "You have already cast your vote" : !votePermission ? "Vote permission not granted by the election coordinator" : "Cast your vote now"}
            >
              <Vote className="h-3.5 w-3.5 mr-1.5" />
              {hasVoted ? "Already Voted" : "Cast Vote"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="btn-lift btn-glow btn-icon-slide border-white/20 bg-white/5 backdrop-blur-sm text-white hover:bg-white/15 hover:text-white hover:border-white/30 transition-all duration-200 rounded-xl font-medium"
              onClick={() => nav({ to: "/voter/candidates" })}
            >
              <Users className="h-3.5 w-3.5 mr-1.5" />
              View Candidates
            </Button>
          </div>
        </div>

        {/* ── 4 Status Cards Row (Horizontal align) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {/* Voter Status Card */}
          <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm hover:translate-y-[-2px] transition-all duration-200 flex items-center gap-4 h-28">
            <div className="h-12 w-12 rounded-full bg-[#16A34A]/10 text-[#16A34A] flex items-center justify-center shrink-0">
              <Shield className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Voter Status</p>
              <p className="text-base font-extrabold text-[#102A27] mt-1.5 leading-none">Eligible</p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-none truncate">You can vote</p>
            </div>
          </div>

          {/* Verification Status Card */}
          <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm hover:translate-y-[-2px] transition-all duration-200 flex items-center gap-4 h-28">
            <div className="h-12 w-12 rounded-full bg-[#16A34A]/10 text-[#16A34A] flex items-center justify-center shrink-0">
              <ScanFace className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Verification</p>
              <p className="text-base font-extrabold text-[#102A27] mt-1.5 leading-none">
                {voter.face_enrolled ? "Completed" : "Pending"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-none truncate">Face verification done</p>
            </div>
          </div>

          {/* Voting Status Card */}
          <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm hover:translate-y-[-2px] transition-all duration-200 flex items-center gap-4 h-28">
            <div className="h-12 w-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Lock className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Voting Status</p>
              <p className="text-base font-extrabold text-[#102A27] mt-1.5 leading-none">
                {hasVoted ? "Voted" : "Not Voted"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-none truncate">Vote once only</p>
            </div>
          </div>

          {/* Voter Since Card */}
          <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm hover:translate-y-[-2px] transition-all duration-200 flex items-center gap-4 h-28">
            <div className="h-12 w-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Calendar className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Voter Since</p>
              <p className="text-base font-extrabold text-[#102A27] mt-1.5 leading-none">2024</p>
              <p className="text-[10px] text-muted-foreground mt-1 leading-none truncate">Thank you!</p>
            </div>
          </div>
        </div>

        {/* ── Stepper Timeline Roadmap ── */}
        <ElectionTimeline />

        {/* ── Contested Positions and Overview Grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Today's Election Overview */}
          <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#102A27]">Today's Election Overview</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[#F8FAF9] p-4 rounded-[20px] border border-[#E6ECE9] flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#16A34A]/10 text-[#16A34A] flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Registered</p>
                  <p className="text-lg font-extrabold text-[#102A27] mt-0.5 font-mono">{kpi?.registered?.toLocaleString() ?? "1,254"}</p>
                </div>
              </div>
              <div className="bg-[#F8FAF9] p-4 rounded-[20px] border border-[#E6ECE9] flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#0F8A5F]/10 text-[#0F8A5F] flex items-center justify-center shrink-0">
                  <Vote className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Votes Cast</p>
                  <p className="text-lg font-extrabold text-[#102A27] mt-0.5 font-mono">{kpi?.votesCast?.toLocaleString() ?? "842"}</p>
                </div>
              </div>
              <div className="bg-[#F8FAF9] p-4 rounded-[20px] border border-[#E6ECE9] flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Turnout</p>
                  <p className="text-lg font-extrabold text-[#102A27] mt-0.5 font-mono">{kpi?.turnout ?? "67.21"}%</p>
                </div>
              </div>
              <div className="bg-[#F8FAF9] p-4 rounded-[20px] border border-[#E6ECE9] flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-orange-500/10 text-orange-600 flex items-center justify-center shrink-0">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Positions</p>
                  <p className="text-lg font-extrabold text-[#102A27] mt-0.5 font-mono">{positionsWithCounts.length || "—"}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Top Contested Positions */}
          <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#102A27]">Top Contested Positions</h3>
              <Link to="/voter/candidates" className="text-xs font-bold text-[#0F8A5F] hover:underline">View All</Link>
            </div>
            <div className="space-y-2">
              {positionsWithCounts.slice(0, 4).map((pos) => {
                const style = getPositionStyle(pos.name);
                return (
                  <button
                    key={pos.name}
                    onClick={() => nav({ to: "/voter/candidates" })}
                    className="w-full flex items-center justify-between p-3 rounded-[20px] bg-[#F8FAF9] border border-[#E6ECE9] hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", style.bg)}>
                        {style.icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#102A27] truncate">{pos.name}</p>
                        <p className="text-[10px] text-muted-foreground">{pos.count} Candidates nominated</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                );
              })}
              {positionsWithCounts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">No positions defined.</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Ready to make your voice heard footer banner CTA ── */}
        <div className="bg-[#F0F6F3] border border-[#DCE6E1] rounded-[24px] p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A] shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-[#102A27]">Ready to make your voice heard?</h4>
              <p className="text-[10px] text-muted-foreground mt-0.5">Review candidates and cast your vote before time runs out.</p>
            </div>
          </div>
          <Button
            onClick={handleVoteNowClick}
            disabled={!votePermission || hasVoted}
            className="bg-[#0D5248] hover:bg-[#0A3B35] text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow-md border-0 shrink-0 cursor-pointer"
          >
            {hasVoted ? "Already Voted" : "Cast My Vote →"}
          </Button>
        </div>

        {/* Party Invitations if any */}
        {(partyInvitations as any[]).length > 0 && (
          <SectionCard
            title="Party Invitations"
            subtitle={`${pendingInvitations.length} pending invitation${pendingInvitations.length !== 1 ? "s" : ""}`}
            className="rounded-[24px] border-[#E6ECE9]"
            icon={Users}
            action={
              pendingInvitations.length > 0 ? (
                <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#0F8A5F] text-white text-[10px] font-bold">
                  {pendingInvitations.length}
                </span>
              ) : undefined
            }
          >
            <div className="space-y-3">
              {(partyInvitations as any[]).map((inv: any, idx: number) => {
                const isPending = (inv.status || "").toLowerCase() === "pending";
                const isAccepted = (inv.status || "").toLowerCase() === "accepted";
                const isRejected = (inv.status || "").toLowerCase() === "rejected";
                const expiresAt = inv.expires_at ? new Date(inv.expires_at) : null;
                const expiresLabel = expiresAt ? `Expires ${expiresAt.toLocaleDateString()}` : "";

                return (
                  <div
                    key={inv.invitation_id}
                    className={cn(
                      "rounded-[20px] border p-5 transition-all duration-200 animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
                      isPending
                        ? "border-[#0F8A5F]/20 bg-[#0F8A5F]/5"
                        : "border-[#E6ECE9] bg-muted/30 opacity-75",
                    )}
                    style={{ animationDelay: `${idx * 80}ms` }}
                  >
                    <div className="flex items-start gap-4">
                      {inv.party_logo_url ? (
                        <img
                          src={inv.party_logo_url}
                          alt={inv.party_name}
                          className="h-12 w-12 rounded-xl object-cover shadow shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-[#0F8A5F]/10 flex items-center justify-center shrink-0 shadow">
                          <span className="text-lg font-bold text-[#0F8A5F]">
                            {inv.party_symbol || (inv.party_name || "P").charAt(0)}
                          </span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <p className="font-semibold text-sm">{inv.party_name}</p>
                            {inv.party_slogan && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">"{inv.party_slogan}"</p>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold",
                                isPending
                                  ? "bg-amber-100 text-amber-700 border-amber-200"
                                  : isAccepted
                                    ? "bg-green-100 text-green-700 border-green-200"
                                    : isRejected
                                      ? "bg-red-100 text-red-700 border-red-200"
                                      : "bg-muted text-muted-foreground border-border",
                              )}
                            >
                              {isPending ? "⏳ Pending" : isAccepted ? "✓ Accepted" : isRejected ? "✗ Rejected" : "Expired"}
                            </span>
                            {isPending && expiresLabel && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" /> {expiresLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          <span className="text-xs bg-[#0F8A5F]/10 text-[#0F8A5F] px-2 py-0.5 rounded-full font-bold">
                            {inv.role?.replace(/_/g, " ")}
                          </span>
                          {inv.position && (
                            <span className="text-xs text-muted-foreground font-semibold">{inv.position}</span>
                          )}
                        </div>

                        {isPending && (
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => acceptInvitationMutation.mutate(inv.invitation_id)}
                              disabled={acceptInvitationMutation.isPending || rejectInvitationMutation.isPending}
                              className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#0F8A5F] text-white hover:bg-[#0F8A5F]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {acceptInvitationMutation.isPending ? "Accepting..." : "Accept"}
                            </button>
                            <button
                              onClick={() => rejectInvitationMutation.mutate(inv.invitation_id)}
                              disabled={acceptInvitationMutation.isPending || rejectInvitationMutation.isPending}
                              className="flex-1 py-2 rounded-xl text-xs font-bold border border-destructive/40 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        )}
      </div>

      {/* ── RIGHT: Side widgets (1/3 width) ── */}
      <div className="space-y-6">
        {/* Dynamic Election Calendar Component */}
        <ElectionCalendar />

        {/* Important Notices */}
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#102A27]">
              Important Notices
            </h3>
            <Link to="/voter/notifications" className="text-xs font-bold text-[#0F8A5F] hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-[#E6ECE9]">
            {notifications.slice(0, 4).map((n: any, i: number) => (
              <div
                key={n.id}
                onClick={() => nav({ to: "/voter/notifications" })}
                className="py-3.5 cursor-pointer group flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-[#16A34A]/10 text-[#16A34A] flex items-center justify-center shrink-0 group-hover:bg-[#16A34A]/20 transition-colors">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#102A27] group-hover:text-[#0F8A5F] transition-colors leading-normal">
                      {n.title}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                  {n.time}
                </span>
              </div>
            ))}
            {notifications.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No notices available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
