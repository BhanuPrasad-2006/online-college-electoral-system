import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useCandidateProfile, useCurrentPhase, useElection } from "@/hooks/use-election-data";
import { useNotifications } from "@/context/NotificationStore";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageHeader, SectionCard } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { CheckCircle2, Clock, FileCheck, Brain, Bell, AlertCircle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

function Page() {
  const nav = useNavigate();
  const { data: profile, isPending: loadingProfile, isError: profileError } = useCandidateProfile();
  const { data: phaseData } = useCurrentPhase();
  const { data: election } = useElection();
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

  if (loadingProfile) return <PageLoader />;
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
            className="px-6 py-2.5 rounded-xl bg-[#1F3A6E] text-white font-semibold hover:bg-[#1F3A6E]/90 transition-all shadow-md"
          >
            Try Again
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Need help?{" "}
          <Link to="/candidate/apply" className="text-[#6C63FF] hover:underline font-medium">
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${candidateName.split(" ")[0]}`}
        subtitle={`Running for ${profile.position} · ${profile.department}`}
      />

      {/* Application Status Banner Gating */}
      {(statusUpper === "PENDING" || statusUpper === "UNDER_REVIEW") && (
        <div className="bg-warning/10 border border-warning/20 text-warning-foreground rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Application Under Review</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your candidate profile has been logged and is currently in{" "}
              <span className="font-semibold">{profile.status}</span> status. The Election Committee
              is verifying your details. Campaign analytics and AI matching tools will become fully
              active once approved.
            </p>
          </div>
        </div>
      )}

      {/* Phase Info Banner */}
      {phaseData && (
        <div className="bg-[#1F3A6E] text-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-fade-in shadow-md">
          <div>
            <p className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#6C63FF]" />
              Current Phase:{" "}
              {phaseData.is_paused
                ? "PAUSED"
                : (phaseData.phase || "Unknown").toUpperCase().replace(/_/g, " ")}
            </p>
            {!phaseData.is_paused && phaseData.remaining_time && (
              <p className="text-xs text-white/80 mt-1">
                Time Remaining:{" "}
                <span className="font-bold text-white">{phaseData.remaining_time}</span>
              </p>
            )}
          </div>
          {!phaseData.is_paused && phaseData.next_phase && (
            <div className="text-right">
              <p className="text-xs text-white/60 uppercase tracking-wider font-semibold">
                Up Next
              </p>
              <p className="text-sm font-medium">{phaseData.next_phase.replace(/_/g, " ")}</p>
            </div>
          )}
        </div>
      )}

      {statusUpper === "REJECTED" && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Application Rejected</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reason from Admin:{" "}
              <span className="font-semibold text-foreground">
                "{profile.admin_remarks || "No remarks provided"}"
              </span>
              . Please contact the Administrator for assistance.
            </p>
          </div>
        </div>
      )}

      {statusUpper === "APPROVED" && (
        <div className="bg-success/10 border border-success/20 text-success rounded-xl p-4 flex items-start gap-3 animate-fade-in">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold">Application Approved</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Congratulations! Your candidacy for{" "}
              <span className="font-semibold text-foreground">{profile.position}</span> is active
              and approved. You are authorized to proceed with your campaign.
            </p>
          </div>
        </div>
      )}

      <SectionCard delay={100}>
        <h2 className="text-base font-semibold mb-5">Application Status</h2>
        <div className="flex items-center">
          {timelineStages.map((s, i, a) => (
            <div key={i} className="flex-1 flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold transition-transform hover:scale-110",
                    s.state === "done"
                      ? "bg-success text-white shadow-md shadow-success/30"
                      : s.state === "active"
                        ? "bg-gradient-to-br from-[#1F3A6E] to-[#6C63FF] text-white shadow-md animate-pulse"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {s.state === "done" ? <CheckCircle2 className="h-5 w-5" /> : i + 1}
                </div>
                <p className="text-xs font-medium mt-2 text-center">{s.label}</p>
                <p className="text-[10px] text-muted-foreground">{s.date}</p>
              </div>
              {i < a.length - 1 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2 transition-colors",
                    s.state === "done" ? "bg-success" : "bg-border",
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={FileCheck}
          label="Application Status"
          value={
            <Badge
              className={cn(
                statusUpper === "APPROVED"
                  ? "bg-success text-white"
                  : statusUpper === "REJECTED"
                    ? "bg-destructive text-white"
                    : statusUpper === "UNDER_REVIEW"
                      ? "bg-info text-white"
                      : "bg-warning text-warning-foreground",
              )}
            >
              {profile.status}
            </Badge>
          }
          delay={150}
        />

        <StatCard
          icon={FileCheck}
          label="Manifesto Status"
          value={<Badge className="bg-[#6C63FF] text-white">Published</Badge>}
          tone="bg-[#6C63FF]/10 text-[#6C63FF]"
          delay={200}
        />
        <StatCard
          icon={Brain}
          label="AI Report"
          value={
            <Link
              to="/candidate/ai-report"
              className="text-[#6C63FF] font-semibold hover:underline"
            >
              View →
            </Link>
          }
          delay={250}
        />
      </div>

      <SectionCard delay={300}>
        <div className="flex items-center gap-2 mb-4">
          <Brain className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">AI Report Summary</h2>
        </div>
        <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 mb-4">
          <p className="text-sm font-semibold">Top Student Concern: Wi-Fi & Infrastructure</p>
          <p className="text-xs text-muted-foreground mt-1">
            412 mentions · 67% negative sentiment
          </p>
        </div>
        <div className="space-y-2 mb-5">
          <div className="flex justify-between text-sm">
            <span>Manifesto coverage of top concerns</span>
            <span className="font-semibold text-[#6C63FF]">64%</span>
          </div>
          <Progress value={64} className="h-2.5" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link
            to="/candidate/ai-report"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-gradient-to-r from-[#1F3A6E] to-[#6C63FF] text-white text-sm font-semibold shadow-md hover:opacity-95 transition-all hover:-translate-y-0.5"
          >
            View Full AI Report
          </Link>

          {phaseData?.phase === "registration_open" || phaseData?.phase === "campaign_period" ? (
            <Link
              to="/candidate/manifesto"
              className="inline-flex items-center px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted transition-colors"
            >
              Edit Manifesto
            </Link>
          ) : (
            <div
              className="inline-flex items-center px-4 py-2 rounded-lg border border-border bg-muted/50 text-muted-foreground text-sm font-medium cursor-not-allowed"
              title="Manifesto editing is only allowed during registration and campaign periods"
            >
              <Lock className="h-4 w-4 mr-2" />
              Manifesto Locked
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard delay={400}>
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-[#6C63FF]" />
          <h2 className="text-base font-semibold">Recent Notifications</h2>
        </div>
        <div className="space-y-1">
          {notifications.slice(0, 4).map((n, i) => (
            <div
              key={n.id}
              className={cn(
                "flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg transition-colors hover:bg-muted/50",
                "animate-fade-in-up opacity-0 [animation-fill-mode:forwards]",
              )}
              style={{ animationDelay: `${450 + i * 50}ms` }}
            >
              <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.time}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export const Route = createFileRoute("/candidate/dashboard")({ component: Page });
