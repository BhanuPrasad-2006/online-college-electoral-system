import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Users,
  BarChart2,
  Bell,
  Settings,
  LogOut,
  LayoutDashboard,
  FileEdit,
  Brain,
  GraduationCap,
  Layers,
  ListChecks,
  Megaphone,
  Shield,
  ScrollText,
  Activity,
  Cog,
  Film,
  MessageSquarePlus,
  ShieldCheck,
  Lock,
  TrendingUp,
  Camera,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/context/NotificationStore";
import { useCandidateProfile } from "@/hooks/use-election-data";
import { fetchPendingPhotos } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

interface SidebarLink {
  to: string;
  label: string;
  icon: React.ComponentType<any>;
  badge?: number;
}

const VOTER_LINKS: SidebarLink[] = [
  { to: "/voter/dashboard", label: "Dashboard", icon: Home },
  { to: "/voter/candidates", label: "Candidates & Manifestos", icon: Users },
  { to: "/voter/media", label: "Campaign Gallery", icon: Film },
  { to: "/voter/concerns", label: "Send a Concern", icon: MessageSquarePlus },
  { to: "/voter/statistics", label: "Statistics", icon: BarChart2 },
  { to: "/voter/results", label: "Results", icon: TrendingUp },
];

const CANDIDATE_LINKS: SidebarLink[] = [
  { to: "/candidate/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/candidate/manifesto", label: "Manifesto Editor", icon: FileEdit },
  { to: "/candidate/media", label: "Campaign Media", icon: Film },
  { to: "/candidate/ai-report", label: "AI Report", icon: Brain },
  { to: "/candidate/status", label: "Application Status", icon: ListChecks },
  { to: "/candidate/concerns", label: "Student Concerns", icon: MessageSquarePlus },
  { to: "/candidate/notifications", label: "Notifications", icon: Bell, badge: 2 },
  { to: "/candidate/settings", label: "Settings", icon: Settings },
];

const ADMIN_LINKS: SidebarLink[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: Shield },
  { to: "/admin/candidates", label: "Manage Candidates", icon: Users },
  { to: "/admin/manifestos", label: "Manifesto Approval", icon: FileEdit },
  { to: "/admin/media", label: "Content Approval", icon: ShieldCheck },
  { to: "/admin/election", label: "Election Control", icon: Cog },
  { to: "/admin/ai-monitoring", label: "AI Monitoring", icon: Activity },
  { to: "/admin/concerns-clusters", label: "Concerns Clusters", icon: Layers },
  { to: "/admin/campus-report", label: "Campus Report", icon: BarChart2 },
  { to: "/admin/results", label: "Results", icon: TrendingUp },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/pending-photos", label: "Pending Photos", icon: Camera },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
];

export type SidebarKind = "voter" | "candidate" | "admin";

const LINKS_FOR: Record<SidebarKind, SidebarLink[]> = {
  voter: VOTER_LINKS,
  candidate: CANDIDATE_LINKS,
  admin: ADMIN_LINKS,
};

export function Sidebar({ kind, onNavigate }: { kind: SidebarKind; onNavigate?: () => void }) {
  const links = LINKS_FOR[kind];
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const { unreadCount } = useNotifications();
  const nav = useNavigate();

  // Fetch candidate profile status if we are on the candidate portal
  const { data: profile } = useCandidateProfile();
  const statusUpper = profile?.status?.toUpperCase() || "PENDING";
  const isApproved = statusUpper === "APPROVED";

  // Fetch pending photo count for admin sidebar badge
  const { data: pendingPhotosList } = useQuery({
    queryKey: ["pending-photos"],
    queryFn: fetchPendingPhotos,
    staleTime: 30_000,
    enabled: kind === "admin",
  });
  const pendingPhotoCount = Array.isArray(pendingPhotosList) ? pendingPhotosList.length : 0;

  return (
    <aside className="w-[260px] bg-sidebar text-sidebar-foreground h-screen fixed left-0 top-0 z-20 flex flex-col">
      <div className="px-6 py-5 flex items-center gap-2 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#6C63FF] to-[#1F3A6E] flex items-center justify-center shadow-md shadow-[#6C63FF]/30">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">CollegeVote</p>
          <p className="text-[11px] text-sidebar-foreground/60 capitalize">{kind} Portal</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map((l) => {
          const active = path === l.to;
          const Icon = l.icon;
          const badge = l.to.endsWith("/notifications") ? unreadCount : l.to.endsWith("/pending-photos") ? pendingPhotoCount : "badge" in l ? l.badge : 0;

          // Determine if this candidate link is locked (campaign features lock unless approved)
          const isCampaignTab = [
            "/candidate/manifesto",
            "/candidate/media",
            "/candidate/ai-report",
          ].includes(l.to);
          const isLocked = kind === "candidate" && isCampaignTab && !isApproved;

          if (isLocked) {
            return (
              <button
                key={l.to}
                onClick={() => {
                  toast.error(
                    `Access Locked. The "${l.label}" will activate once your candidacy is approved by the admin.`,
                    {
                      description: `Current Status: ${profile?.status || "Pending review"}`,
                    },
                  );
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/30 hover:bg-sidebar-accent/10 hover:text-sidebar-foreground/40 transition-all duration-200 cursor-not-allowed",
                )}
              >
                <Icon className="h-[18px] w-[18px] opacity-40" />
                <span className="flex-1 text-left opacity-40">{l.label}</span>
                <Lock className="h-3.5 w-3.5 opacity-40" />
              </button>
            );
          }

          return (
            <Link
              key={l.to}
              to={l.to}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                active
                  ? "bg-sidebar-accent text-white shadow-md before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:bg-[#6C63FF] before:rounded-r before:shadow-[0_0_8px_#6C63FF]"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white hover:translate-x-0.5",
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{l.label}</span>
              {badge ? (
                <span className="bg-[#6C63FF] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={() => {
            logout();
            nav({ to: "/" });
          }}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white transition-colors"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Logout
        </button>
      </div>
    </aside>
  );
}
