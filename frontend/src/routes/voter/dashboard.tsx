import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useCandidates, useVoterProfile, useKpi, useCurrentPhase } from "@/hooks/use-election-data";
import { useNotifications } from "@/context/NotificationStore";
import { PageLoader } from "@/components/PageLoader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  CheckCircle2,
  Users,
  TrendingUp,
  AlertCircle,
  Bell,
  ChevronRight,
  Lock,
  Clock,
  Vote,
  Sparkles,
  Camera,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { resolveApiAssetUrl, resolveVoterPhotoUrl, fetchMyPartyInvitations, acceptPartyInvitation, rejectPartyInvitation } from "@/lib/api";
import { useAntiAbuse } from "@/hooks/useAntiAbuse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// ── Election phase helpers ─────────────────────────────────────
// Backend /election/current-phase is the single source of truth for phase.
// No client-side date math — we trust the backend PhaseEngine completely.
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
  const { data: phaseData } = useCurrentPhase();
  const { notifications = [] } = useNotifications();
  const [timeLeft, setTimeLeft] = useState<string>("");
  const antiAbuse = useAntiAbuse();
  const qc = useQueryClient();

  // Party invitations query
  const { data: partyInvitations = [], refetch: refetchInvitations } = useQuery({
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


  const effectivePhase = reconcilePhase(phaseData);
  const isRegOpen = effectivePhase?.phase === "registration_open";
  const isVoteOpen = effectivePhase?.phase === "voting_open";
  const regOpensSoon = effectivePhase?.phase === "pre_registration";
  const voteOpensSoon =
    effectivePhase?.phase === "registration_closed" || effectivePhase?.phase === "campaign_period";
  const isPaused = phaseData?.is_paused;



  const remainingTimeStr = effectivePhase?.remaining_time || "";

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
    (c) => (c.status || "").toLowerCase() === "approved",
  );
  const matched = [...approvedCandidates].sort((a, b) => (b.match || 75) - (a.match || 75));
  const firstName = voter.name.split(" ")[0];

  // Check voted status: use API data (live from server) OR localStorage fallback
  // localStorage is set immediately after a successful vote on the /voter/vote page
  const hasVoted = Boolean(
    voter.voted ||
    (typeof localStorage !== "undefined" &&
      localStorage.getItem("collegevote-has-voted") === "true")
  );
  const votePermission = voter.vote_permission;
  // Phase data loading guard: don't show "Voting Closed" when election/phase hasn't loaded yet
  const isPhaseLoading = !phaseData;
  const isPhaseUnknown = effectivePhase?.phase === "unknown";

  function handleVoteNowClick() {
    if (antiAbuse.isBlocked("go-vote")) return;
    if (!hasVoted && votePermission) nav({ to: "/voter/vote" });
    antiAbuse.startCooldown("go-vote", 2);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <PageHeader
          title={`Welcome back, ${firstName}`}
          subtitle="Here's what's happening with the election."
        />                        {timeLeft && isVoteOpen && (
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
                {voter.vote_permission ? (
                  <>
                    You are eligible to register as a candidate — closes in{" "}
                    <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span>
                  </>
                ) : (
                  <>
                    Registration is open — closes in{" "}
                    <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span> —
                    contact admin for permission
                  </>
                )}
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
                Cast your ballot securely — closes in{" "}
                <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span>
              </p>
            </div>
            {!hasVoted && (
              <button
                onClick={handleVoteNowClick}
                disabled={antiAbuse.isBlocked("go-vote")}
                className="shrink-0 z-10"
              >
                <div className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md ${antiAbuse.isBlocked("go-vote") ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-violet-600 text-white hover:bg-violet-700 animate-pulse'}`}>
                  <Sparkles className="h-4 w-4" />
                  {antiAbuse.isBlocked("go-vote") ? `Wait ${Math.ceil(antiAbuse.cooldowns["go-vote"]?.remaining || 0)}s` : "Vote Now"}
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
                Candidate registration begins in{" "}
                <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span>
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
                The polls will open in{" "}
                <span className="font-mono font-bold text-[#6C63FF]">{remainingTimeStr}</span>
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
          icon={hasVoted ? CheckCircle2 : votePermission ? AlertCircle : Lock}
          label="Your Status"
          value={
            hasVoted
              ? "Voted ✓"
              : votePermission
                ? "Authorized to Vote"
                : "Pending Admin Permission"
          }
          subtext={voter.verification_id_set ? "Verification ID: Set" : "Verification ID: Not Set"}
          tone={
            hasVoted
              ? "bg-success/15 text-success"
              : votePermission
                ? "bg-[#6C63FF]/10 text-[#6C63FF]"
                : "bg-warning/20 text-warning-foreground"
          }
          delay={150}
        />
      </div>

{/* ── Admin Re-upload Request Banner ── */}
      {voter.photo_reupload_requested && (
        <div className="relative overflow-hidden rounded-2xl border border-[#6C63FF]/30 bg-gradient-to-r from-[#6C63FF]/10 to-indigo-500/5 shadow-sm animate-fade-in mb-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-[#6C63FF]" />
          <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1 z-10">
              <h3 className="text-lg font-bold text-[#6C63FF] flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Photo Re-upload Requested by Admin
              </h3>
              <p className="text-sm text-foreground/80 max-w-xl">
                The election admin has requested you to upload a new profile photo.
              </p>
              <Link
                to="/voter/settings"
                className="inline-flex items-center gap-1.5 px-4 py-2 mt-2 rounded-lg bg-[#6C63FF] text-white hover:bg-[#6C63FF]/90 transition-colors text-xs font-semibold shadow-md"
              >
                <Camera className="h-3.5 w-3.5" />
                Upload Photo in Settings
              </Link>
            </div>
          </div>
        </div>
      )}

{/* ── Face / Photo Verification Status with Reference Image ── */}
      <div className="bg-card border border-border/60 rounded-xl p-4 flex items-start gap-4 animate-fade-in">
        {/* Reference photo display */}
        <div className="flex flex-col items-center shrink-0">
          {voter.reference_image_url ? (
            <div className="relative">
              <Avatar className="h-20 w-20 ring-2 ring-[#6C63FF]/30 rounded-xl">
                <AvatarImage
                  src={resolveVoterPhotoUrl(voter.voter_id)}
                  alt="Reference photo"
                  className="object-cover rounded-xl"
                />
                <AvatarFallback className="bg-muted rounded-xl">
                  <Camera className="h-6 w-6 text-muted-foreground" />
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-success border-2 border-card flex items-center justify-center">
                <CheckCircle2 className="h-3 w-3 text-white" />
              </span>
            </div>
          ) : (
            <div className="h-20 w-20 shrink-0 rounded-xl bg-warning/15 flex items-center justify-center ring-2 ring-warning/20">
              <AlertTriangle className="h-8 w-8 text-warning" />
            </div>
          )}
          {voter.photo_reupload_count !== undefined && (
            <span className="text-[10px] text-muted-foreground mt-1.5 font-medium">
              {voter.photo_reupload_count}/2 re-uploads used
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {voter.pending_face_enrolled ? (
            <>
              <p className="text-sm font-semibold text-warning-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-warning" />
                Photo Pending Admin Review
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your uploaded photo is awaiting approval from the election admin. Once approved, it will replace your current photo (if any).
              </p>
              {voter.reference_image_url && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  You still have an existing photo on file — it will remain active until the new one is approved.
                </p>
              )}
            </>
          ) : voter.face_enrolled ? (
            <>
              <p className="text-sm font-semibold text-success flex items-center gap-1.5">
                <Camera className="h-4 w-4" />
                Photo Verified ✓
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your reference photo is enrolled for Just-In-Time face verification during voting.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-warning-foreground">Photo Not Enrolled</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isRegOpen
                  ? "Go to Settings to upload a photo, or contact the election admin."
                  : "No reference photo on file. Contact the election admin to enroll your photo."
                }
              </p>
            </>
          )}
          {voter.photo_reupload_requested && (
            <p className="text-xs font-medium text-[#6C63FF] mt-1.5 flex items-center gap-1">
              <Camera className="h-3 w-3" />
              Admin has requested a new photo — manage it in Settings
            </p>
          )}
        </div>
        {/* Self-service upload is on the Settings page */}
        <div className="shrink-0">
          <Link
            to="/voter/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#6C63FF]/10 text-[#6C63FF] hover:bg-[#6C63FF]/20 transition-colors text-xs font-medium"
          >
            <Camera className="h-3.5 w-3.5" />
            Manage Photo
          </Link>
        </div>
      </div>

      {effectivePhase?.phase !== "results_announced" && (
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
                  The election admin has not authorized your student profile to vote yet. Please wait
                  for approval or contact the election coordinator.
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
          ) : isPhaseLoading || isPhaseUnknown ? (
            <div
              className="flex items-center gap-3 px-16 py-5 bg-muted/50 border-2 border-border/50 text-muted-foreground font-bold text-xl rounded-2xl shadow-sm cursor-not-allowed select-none transition-all duration-300"
              style={{ minWidth: "280px", justifyContent: "center" }}
            >
              <div className="animate-spin h-5 w-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full" />
              <span className="opacity-60">Checking Election Status...</span>
            </div>
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
      )}

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

      {/* ── Party Invitations Section ── */}
      {(partyInvitations as any[]).length > 0 && (
        <SectionCard
          title="Party Invitations"
          subtitle={`${pendingInvitations.length} pending invitation${pendingInvitations.length !== 1 ? "s" : ""}`}
          icon={Users}
          action={
            pendingInvitations.length > 0 ? (
              <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-[#6C63FF] text-white text-[10px] font-bold">
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
              const isExpired = (inv.status || "").toLowerCase() === "expired";
              const expiresAt = inv.expires_at ? new Date(inv.expires_at) : null;
              const expiresLabel = expiresAt ? `Expires ${expiresAt.toLocaleDateString()}` : "";

              return (
                <div
                  key={inv.invitation_id}
                  className={cn(
                    "rounded-2xl border p-5 transition-all duration-200 animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
                    isPending
                      ? "border-[#6C63FF]/25 bg-gradient-to-br from-[#6C63FF]/5 to-transparent"
                      : "border-border bg-muted/30 opacity-75",
                  )}
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <div className="flex items-start gap-4">
                    {/* Party Logo / Avatar */}
                    {inv.party_logo_url ? (
                      <img
                        src={inv.party_logo_url}
                        alt={inv.party_name}
                        className="h-12 w-12 rounded-xl object-cover shadow shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#6C63FF]/20 to-[#1F3A6E]/20 flex items-center justify-center shrink-0 shadow">
                        <span className="text-lg font-bold text-[#6C63FF]">
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
                                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800"
                                : isAccepted
                                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800"
                                  : isRejected
                                    ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800"
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
                        <span className="text-xs bg-[#6C63FF]/10 text-[#6C63FF] px-2 py-0.5 rounded-full font-medium">
                          {inv.role?.replace(/_/g, " ")}
                        </span>
                        {inv.position && (
                          <span className="text-xs text-muted-foreground">{inv.position}</span>
                        )}
                        {inv.invited_by_name && (
                          <span className="text-xs text-muted-foreground">
                            Invited by <strong>{inv.invited_by_name}</strong>
                          </span>
                        )}
                      </div>

                      {inv.message && (
                        <p className="text-xs text-muted-foreground italic mt-2 p-2 bg-muted/50 rounded-lg">
                          "{inv.message}"
                        </p>
                      )}

                      {isPending && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => acceptInvitationMutation.mutate(inv.invitation_id)}
                            disabled={acceptInvitationMutation.isPending || rejectInvitationMutation.isPending}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#1F3A6E] text-white hover:bg-[#1F3A6E]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {acceptInvitationMutation.isPending ? (
                              <><span className="animate-spin h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full" /> Accepting...</>
                            ) : (
                              <><CheckCircle2 className="h-3.5 w-3.5" /> Accept</>  
                            )}
                          </button>
                          <button
                            onClick={() => rejectInvitationMutation.mutate(inv.invitation_id)}
                            disabled={acceptInvitationMutation.isPending || rejectInvitationMutation.isPending}
                            className="flex-1 py-2 rounded-lg text-sm font-semibold border border-destructive/40 text-destructive hover:bg-destructive/5 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {isAccepted && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-2 font-medium">
                          ✓ You have joined this party. Login as a Candidate to access the Party Dashboard.
                        </p>
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
  );
}
