import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidateProfile, useCurrentPhase, useElection, useKpi } from "@/hooks/use-election-data";
import { useNotifications } from "@/context/NotificationStore";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { CheckCircle2, Clock, FileCheck, Brain, Bell, AlertCircle, Lock, Users, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAntiAbuse } from "@/hooks/useAntiAbuse";
import { Button } from "@/components/ui/button";
import { ElectionCalendar } from "@/components/ElectionCalendar";
import { ElectionTimeline } from "@/components/ElectionTimeline";

function Page() {
  const nav = useNavigate();
  const { data: profile, isPending: loadingProfile, isError: profileError } = useCandidateProfile();
  const { data: phaseData } = useCurrentPhase();
  const { data: election } = useElection();
  const { data: kpi } = useKpi();
  const antiAbuse = useAntiAbuse();
  const { notifications = [] } = useNotifications();

  // ── Access control: block unregistered candidates when registration is not open ──
  const [accessChecked, setAccessChecked] = useState(false);
  useEffect(() => {
    if (!loadingProfile && profileError && phaseData && !accessChecked) {
      const isRegOpen = phaseData.phase === "registration_open";
      if (!isRegOpen) {
        toast.error("Candidate registration is not currently open.");
        nav({ to: "/candidate/apply" });
      }
      setAccessChecked(true);
    }
    if (!loadingProfile && profile && !accessChecked) {
      setAccessChecked(true);
    }
  }, [loadingProfile, profileError, profile, phaseData, nav, accessChecked]);

  const handleDownloadPdf = async () => {
    const { getAuthToken, API_BASE_URL } = await import("@/lib/api");
    const token = getAuthToken();
    
    const response = await fetch(`${API_BASE_URL}/candidates/me/report/pdf`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error("Failed to download PDF report");
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Election_Report_${profile?.full_name?.replace(/ /g, "_") || "Candidate"}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success("PDF downloaded successfully");
  };

  if (loadingProfile || !profile) return <PageLoader />;
  if (profileError || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold mb-2">Failed to Load Profile</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Could not fetch your candidate profile. This might be because you haven't registered as a candidate yet, or the server is unreachable.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 rounded-xl bg-[#0F8A5F] text-white font-semibold hover:bg-[#0F8A5F]/90 transition-all shadow-md"
          >
            Try Again
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Need help?{" "}
          <Link to="/candidate/apply" className="text-[#0F8A5F] hover:underline font-medium">
            Register as Candidate
          </Link>
        </p>
      </div>
    );
  }

  const candidateName = profile.full_name || profile.name || "Candidate";
  const statusUpper = (profile.status || "PENDING").toUpperCase();

  const isApproved = statusUpper === "APPROVED";
  const isRejected = statusUpper === "REJECTED";
  const isUnderReview = statusUpper === "UNDER REVIEW" || statusUpper === "UNDER_REVIEW";

  const timelineStages = [
    {
      label: "Submitted",
      date: profile.applied_at
        ? new Date(profile.applied_at).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "Submitted",
      state: "done" as const,
    },
    {
      label: "Under Review",
      date: isApproved || isRejected ? "Completed" : isUnderReview ? "Active" : "Pending",
      state:
        isApproved || isRejected
          ? ("done" as const)
          : isUnderReview
            ? ("active" as const)
            : ("pending" as const),
    },
    {
      label: isRejected ? "Rejected" : "Approved",
      date: isApproved || isRejected ? "Completed" : "Pending",
      state: isApproved || isRejected ? ("done" as const) : ("pending" as const),
    },
  ];

  const phaseLabel = phaseData?.phase?.replace(/_/g, " ") || "Loading...";
  const phaseDisp = phaseLabel.charAt(0).toUpperCase() + phaseLabel.slice(1);

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
                  <Users className="h-3 w-3 mr-1 shrink-0" />
                  Candidate Portal
                </Badge>
                <Badge
                  className={`text-[11px] border-0 font-bold py-0.5 px-2.5 rounded-full ${
                    isApproved ? "bg-[#16A34A] text-white" : isRejected ? "bg-[#DC2626] text-white" : "bg-[#D97706] text-white"
                  }`}
                >
                  {profile.status}
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                Welcome back, {candidateName.split(" ")[0]}! 👋
              </h1>
              <p className="text-sm text-white/70 max-w-lg leading-relaxed">
                Running for <span className="text-white/90 font-semibold">{profile.position}</span> · {profile.department}
              </p>
            </div>

            {/* Countdown Box */}
            {phaseData?.remaining_time && (
              <div className="bg-white/10 border border-white/20 rounded-[20px] p-4 text-center shrink-0 min-w-[170px] backdrop-blur-md">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">Time Remaining</p>
                <p className="text-lg font-mono font-bold text-white mt-1">{phaseData.remaining_time}</p>
              </div>
            )}
          </div>

          {/* Quick status bar */}
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">Current Phase</p>
              <p className="text-xs font-bold text-white mt-0.5 capitalize">
                {phaseData?.is_paused ? "PAUSED" : phaseDisp}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">Next Phase</p>
              <p className="text-xs font-bold text-white mt-0.5 capitalize">
                {phaseData?.next_phase ? phaseData.next_phase.replace(/_/g, " ") : "—"}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">Voter Turnout</p>
              <p className="text-xs font-bold text-white mt-0.5">
                {kpi?.turnout ? `${kpi.turnout}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">Registered Voters</p>
              <p className="text-xs font-bold text-white mt-0.5">
                {kpi?.registered ? kpi.registered.toLocaleString() : "—"}
              </p>
            </div>
          </div>
          {/* Quick action buttons — consistent with emerald primary + glass secondary */}
          <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4 flex-wrap">
            <Link
              to="/candidate/ai-report"
              className="btn-shine btn-lift btn-glow btn-icon-slide inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-[#0F8A5F] to-[#16A34A] text-white shadow-lg shadow-[#16A34A]/25 hover:shadow-xl hover:shadow-[#16A34A]/30 hover:-translate-y-0.5 transition-all duration-200 text-xs font-bold"
            >
              <Brain className="h-3.5 w-3.5" />
              AI Diagnostics
            </Link>
            {phaseData?.phase === "registration_open" || phaseData?.phase === "campaign_period" ? (
              <Link
                to="/candidate/manifesto"
                className="btn-lift btn-glow btn-icon-slide inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-white/20 bg-white/5 backdrop-blur-sm text-white hover:bg-white/15 hover:border-white/30 transition-all duration-200 text-xs font-medium"
              >
                <FileCheck className="h-3.5 w-3.5" />
                Edit Manifesto
              </Link>
            ) : (
              <span
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-white/40 text-xs font-medium cursor-not-allowed"
                title="Manifesto editing is only allowed during registration and campaign periods"
              >
                <Lock className="h-3.5 w-3.5" />
                Manifesto Locked
              </span>
            )}
          </div>
        </div>

        {/* ── Status Alerts ── */}
        {(statusUpper === "PENDING" || statusUpper === "UNDER_REVIEW") && (
          <div className="bg-[#D97706]/5 border border-[#D97706]/20 rounded-[24px] p-5 flex items-start gap-4 shadow-sm bg-white">
            <div className="h-10 w-10 rounded-xl bg-[#D97706]/10 flex items-center justify-center text-[#D97706] shrink-0">
              <Clock className="h-5 w-5 animate-pulse-subtle" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#102A27]">Application Under Review</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Your candidate profile has been logged and is currently in{" "}
                <span className="font-bold text-[#102A27]">{profile.status}</span> status. The Election Committee
                is verifying your details. Campaign analytics and AI matching tools will become fully
                active once approved.
              </p>
            </div>
          </div>
        )}

        {statusUpper === "REJECTED" && (
          <div className="bg-[#DC2626]/5 border border-[#DC2626]/20 rounded-[24px] p-5 flex items-start gap-4 shadow-sm bg-white">
            <div className="h-10 w-10 rounded-xl bg-[#DC2626]/10 flex items-center justify-center text-[#DC2626] shrink-0">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#102A27]">Application Rejected</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Reason from Admin:{" "}
                <span className="font-bold text-danger">
                  "{profile.admin_remarks || "No remarks provided"}"
                </span>
                . Please contact the Administrator for assistance or re-submission.
              </p>
            </div>
          </div>
        )}

        {statusUpper === "APPROVED" && (
          <div className="bg-[#16A34A]/5 border border-[#16A34A]/20 rounded-[24px] p-5 flex items-start gap-4 shadow-sm bg-white">
            <div className="h-10 w-10 rounded-xl bg-[#16A34A]/10 flex items-center justify-center text-[#16A34A] shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#102A27]">Application Approved</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Congratulations! Your candidacy for{" "}
                <span className="font-bold text-[#102A27]">{profile.position}</span> is active
                and approved. You are authorized to proceed with your campaign.
              </p>
            </div>
          </div>
        )}

        {/* ── Stepper Timeline Roadmap ── */}
        <ElectionTimeline />

        {/* ── Stat Cards Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={FileCheck}
            label="Application Status"
            value={
              <Badge
                className={cn(
                  "font-bold border-0 px-2.5 py-0.5 text-xs rounded-full",
                  statusUpper === "APPROVED"
                    ? "bg-[#16A34A] text-white"
                    : statusUpper === "REJECTED"
                      ? "bg-[#DC2626] text-white"
                      : statusUpper === "UNDER_REVIEW"
                        ? "bg-[#2563EB] text-white"
                        : "bg-[#D97706] text-white",
                )}
              >
                {profile.status}
              </Badge>
            }
            delay={100}
          />

          <StatCard
            icon={FileCheck}
            label="Manifesto Status"
            value={
              <Badge className="bg-[#0F8A5F] text-white border-0 font-bold px-2.5 py-0.5 text-xs rounded-full">
                Published
              </Badge>
            }
            tone="bg-[#0F8A5F]/10 text-[#0F8A5F]"
            delay={150}
          />

          <StatCard
            icon={Brain}
            label="AI Diagnostics"
            value={
              <Link
                to="/candidate/ai-report"
                className="text-[#0F8A5F] font-bold hover:underline text-xs flex items-center gap-1"
              >
                View Report →
              </Link>
            }
            delay={200}
          />
        </div>

        {/* ── AI Diagnostics Summary ── */}
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-[#0F8A5F]" />
            <div>
              <h3 className="text-sm font-bold text-[#102A27]">AI Diagnostics Summary</h3>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Analyze manifesto alignment and concerns</p>
            </div>
          </div>
          
          <div className="bg-[#D97706]/5 border border-[#D97706]/20 rounded-[20px] p-4">
            <p className="text-xs font-bold text-[#D97706]">Top Student Concern: Wi-Fi & Infrastructure</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              412 mentions · 67% negative sentiment
            </p>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-muted-foreground">Manifesto coverage of top concerns</span>
              <span className="text-[#0F8A5F]">64%</span>
            </div>
            <Progress value={64} className="h-2 rounded-full" />
          </div>

          <div className="flex gap-2 flex-wrap pt-2">
            <Link
              to="/candidate/ai-report"
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-[#0F8A5F] text-white text-xs font-bold hover:bg-[#0F8A5F]/90 transition-all shadow-md"
            >
              View Full AI Report
            </Link>

            {phaseData?.phase === "results_announced" && (
              <Button
                onClick={() => antiAbuse.runWithProtection("download-pdf", handleDownloadPdf, 10)}
                disabled={antiAbuse.isBlocked("download-pdf")}
                className="inline-flex items-center px-4 py-2.5 rounded-xl bg-[#16A34A] text-white text-xs font-bold hover:bg-[#16A34A]/90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {antiAbuse.isBlocked("download-pdf") ? (
                  <>
                    <div className="mr-2 h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Please wait...
                  </>
                ) : (
                  <>
                    <FileCheck className="h-4 w-4 mr-1.5" />
                    Download PDF Report
                  </>
                )}
              </Button>
            )}

            {phaseData?.phase === "registration_open" || phaseData?.phase === "campaign_period" ? (
              <Link
                to="/candidate/manifesto"
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-[#E6ECE9] bg-white text-[#102A27] text-xs font-bold hover:bg-gray-50 transition-all"
              >
                Edit Manifesto
              </Link>
            ) : (
              <div
                className="inline-flex items-center px-4 py-2.5 rounded-xl border border-dashed border-muted bg-muted/40 text-muted-foreground text-xs font-bold cursor-not-allowed"
                title="Manifesto editing is only allowed during registration and campaign periods"
              >
                <Lock className="h-3.5 w-3.5 mr-1.5" />
                Manifesto Locked
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT: Side widgets (1/3 width) ── */}
      <div className="space-y-6">
        {/* Dynamic Election Calendar Component */}
        <ElectionCalendar />

        {/* Important Announcements / Notices */}
        <div className="bg-white rounded-[24px] border border-[#E6ECE9] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#102A27] flex items-center gap-2">
              <Bell className="h-4.5 w-4.5 text-[#0F8A5F]" />
              Announcements
            </h3>
            <Link to="/candidate/notifications" className="text-xs font-bold text-[#0F8A5F] hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-[#E6ECE9]">
            {notifications.slice(0, 4).map((n: any, i: number) => (
              <div
                key={n.id}
                onClick={() => nav({ to: "/candidate/notifications" })}
                className="py-3 cursor-pointer group flex items-start gap-2.5"
              >
                <Megaphone className="h-4 w-4 text-[#0F8A5F] mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#102A27] group-hover:text-[#0F8A5F] transition-colors truncate">
                    {n.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.time}</p>
                </div>
              </div>
            ))}
            {notifications.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No announcements available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/dashboard")({ component: Page });
