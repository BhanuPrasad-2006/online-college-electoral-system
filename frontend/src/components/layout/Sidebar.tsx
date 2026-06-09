import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
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
  Calendar,
  FileText,
  Building2,
  Vote,
  BookOpen,
  FileBarChart,
  UserCheck,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/context/NotificationStore";
import { useCandidateProfile } from "@/hooks/use-election-data";
import { fetchPendingPhotos } from "@/lib/api";
import { SUPPORT_EMAIL } from "@/lib/app-config";
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
  { to: "/voter/vote", label: "Cast Vote", icon: Vote },
  { to: "/voter/candidates", label: "Candidates", icon: Users },
  { to: "/voter/results", label: "Results", icon: TrendingUp },
  { to: "/voter/media", label: "Campaign Gallery", icon: Film },
  { to: "/voter/concerns", label: "Send a Concern", icon: MessageSquarePlus },
  { to: "/voter/statistics", label: "Statistics", icon: BarChart3 },
  { to: "/voter/notifications", label: "Notices", icon: Bell, badge: 0 },
];

const CANDIDATE_LINKS: SidebarLink[] = [
  { to: "/candidate/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/candidate/manifesto", label: "Manifesto Editor", icon: FileEdit },
  { to: "/candidate/media", label: "Campaign Media", icon: Film },
  { to: "/candidate/ai-report", label: "AI Report", icon: Brain },
  { to: "/candidate/party-dashboard", label: "Party Dashboard", icon: Building2 },
  { to: "/candidate/status", label: "Application Status", icon: ListChecks },
  { to: "/candidate/concerns", label: "Student Concerns", icon: MessageSquarePlus },
  { to: "/candidate/settings", label: "Settings", icon: Settings },
  { to: "/candidate/notifications", label: "Notifications", icon: Bell, badge: 0 },
];

const ADMIN_LINKS: SidebarLink[] = [
  { to: "/admin/dashboard", label: "Dashboard", icon: Shield },
  { to: "/admin/election", label: "Election Management", icon: Cog },
  { to: "/admin/candidates", label: "Candidates", icon: Users },
  { to: "/admin/parties", label: "Party Applications", icon: Building2 },
  { to: "/admin/manifestos", label: "Manifesto Approval", icon: BookOpen },
  { to: "/admin/media", label: "Content Approval", icon: ShieldCheck },
  { to: "/admin/results", label: "Results", icon: TrendingUp },
  { to: "/admin/ai-monitoring", label: "AI Monitoring", icon: Activity },
  { to: "/admin/concerns-clusters", label: "Concerns Clusters", icon: Layers },
  { to: "/admin/campus-report", label: "Campus Report", icon: BarChart2 },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/pending-photos", label: "Pending Photos", icon: Camera },
  { to: "/admin/meetings", label: "Meetings", icon: Calendar },
  { to: "/admin/notices", label: "Notices", icon: FileText },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
];

export const ADMIN_LINK_ROLES: Record<string, string[]> = {
  "/admin/dashboard": ["SUPER_ADMIN", "ELECTION_MANAGER", "CANDIDATE_MODERATOR", "AUDIT_SECURITY_ADMIN"],
  "/admin/candidates": ["SUPER_ADMIN", "CANDIDATE_MODERATOR"],
  "/admin/parties": ["SUPER_ADMIN", "CANDIDATE_MODERATOR"],
  "/admin/manifestos": ["SUPER_ADMIN", "CANDIDATE_MODERATOR"],
  "/admin/media": ["SUPER_ADMIN", "CANDIDATE_MODERATOR"],
  "/admin/election": ["SUPER_ADMIN", "ELECTION_MANAGER"],
  "/admin/ai-monitoring": ["SUPER_ADMIN", "AUDIT_SECURITY_ADMIN"],
  "/admin/concerns-clusters": ["SUPER_ADMIN", "AUDIT_SECURITY_ADMIN"],
  "/admin/campus-report": ["SUPER_ADMIN", "ELECTION_MANAGER", "AUDIT_SECURITY_ADMIN"],
  "/admin/results": ["SUPER_ADMIN", "ELECTION_MANAGER"],
  "/admin/audit-logs": ["SUPER_ADMIN", "AUDIT_SECURITY_ADMIN"],
  "/admin/pending-photos": ["SUPER_ADMIN", "CANDIDATE_MODERATOR"],
  "/admin/meetings": ["SUPER_ADMIN", "ELECTION_MANAGER", "CANDIDATE_MODERATOR", "AUDIT_SECURITY_ADMIN"],
  "/admin/notices": ["SUPER_ADMIN", "ELECTION_MANAGER", "CANDIDATE_MODERATOR", "AUDIT_SECURITY_ADMIN"],
  "/admin/announcements": ["SUPER_ADMIN", "ELECTION_MANAGER"],
};

export type SidebarKind = "voter" | "candidate" | "admin";

const LINKS_FOR: Record<SidebarKind, SidebarLink[]> = {
  voter: VOTER_LINKS,
  candidate: CANDIDATE_LINKS,
  admin: ADMIN_LINKS,
};

export function Sidebar({ kind, onNavigate }: { kind: SidebarKind; onNavigate?: () => void }) {
  const { logout, adminRole } = useAuth();
  const rawLinks = LINKS_FOR[kind];
  
  const links = useMemo(() => {
    if (kind !== "admin") return rawLinks;
    return rawLinks.filter((l) => {
      const allowed = ADMIN_LINK_ROLES[l.to];
      if (!allowed) return true;
      return adminRole ? allowed.includes(adminRole) : false;
    });
  }, [kind, rawLinks, adminRole]);

  const path = useRouterState({ select: (s) => s.location.pathname });
  const { unreadCount } = useNotifications();
  const nav = useNavigate();

  const { data: profile } = useCandidateProfile();
  const statusUpper = profile?.status?.toUpperCase() || "PENDING";
  const isApproved = statusUpper === "APPROVED";

  const { data: pendingPhotosList } = useQuery({
    queryKey: ["pending-photos"],
    queryFn: fetchPendingPhotos,
    staleTime: 30_000,
    enabled: kind === "admin" && links.some(l => l.to === "/admin/pending-photos"),
  });
  const pendingPhotoCount = Array.isArray(pendingPhotosList) ? pendingPhotosList.length : 0;

  // Group admin links into sections
  const adminSections = useMemo(() => {
    if (kind !== "admin") return null;
    const sections: { label: string; links: SidebarLink[] }[] = [];
    const core = links.filter(l => ["/admin/dashboard", "/admin/election"].includes(l.to));
    if (core.length) sections.push({ label: "ADMIN", links: core });
    const people = links.filter(l => ["/admin/candidates", "/admin/parties", "/admin/manifestos", "/admin/media"].includes(l.to));
    if (people.length) sections.push({ label: "MANAGEMENT", links: people });
    const monitoring = links.filter(l => ["/admin/ai-monitoring", "/admin/concerns-clusters", "/admin/campus-report", "/admin/audit-logs", "/admin/pending-photos"].includes(l.to));
    if (monitoring.length) sections.push({ label: "MONITORING", links: monitoring });
    const comms = links.filter(l => ["/admin/meetings", "/admin/notices", "/admin/announcements"].includes(l.to));
    if (comms.length) sections.push({ label: "COMMUNICATION", links: comms });
    const results = links.filter(l => ["/admin/results"].includes(l.to));
    if (results.length) sections.push({ label: "RESULTS", links: results });
    // Any remaining links
    const existing = new Set([...core, ...people, ...monitoring, ...comms, ...results]);
    const other = links.filter(l => !existing.has(l));
    if (other.length) sections.push({ label: "OTHER", links: other });
    return sections;
  }, [links, kind]);

  return (
    <aside className="glass-sidebar w-[260px] text-sidebar-foreground h-screen fixed left-0 top-0 z-20 flex flex-col">
      {/* Brand */}
      <div className="px-6 py-6 flex items-center gap-3 border-b border-sidebar-border">
        <ShieldCheck className="h-8 w-8 text-[#D9A441] shrink-0" />
        <div>
          <p className="text-base font-extrabold leading-tight tracking-wider text-white">DSCE</p>
          <p className="text-[10px] text-[#16A34A] font-bold uppercase tracking-widest">
            Balloty
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 overflow-y-auto scrollbar-thin">
        {kind === "admin" && adminSections ? (
          adminSections.map((section) => (
            <div key={section.label} className="mb-5 last:mb-0">
              <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/35">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.links.map((l) => renderLink(l, path, unreadCount, pendingPhotoCount, kind, isApproved, profile, onNavigate))}
              </div>
            </div>
          ))
        ) : (
          <div className="space-y-0.5">
            {links.map((l) => renderLink(l, path, unreadCount, pendingPhotoCount, kind, isApproved, profile, onNavigate))}
          </div>
        )}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 space-y-3 border-t border-sidebar-border mt-auto">
        {/* Security Badge */}
        <div className="p-3 rounded-2xl bg-white/5 border border-white/8 shadow-inner text-center space-y-2">
          <div className="mx-auto h-8 w-8 rounded-full bg-[#0F8A5F]/20 flex items-center justify-center">
            <ShieldCheck className="h-4.5 w-4.5 text-[#16A34A]" />
          </div>
          <div>
            <p className="text-xs font-bold text-white tracking-wide">Secure. Fair. Transparent.</p>
            <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">Your vote shapes the future.</p>
          </div>
        </div>

        {/* Support Card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#0F4A40]/30 border border-[#0F8A5F]/20">
          <div className="h-8 w-8 rounded-lg bg-[#0F8A5F]/20 flex items-center justify-center shrink-0">
            <Users className="h-4 w-4 text-[#16A34A]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-sidebar-foreground/50 leading-none">Need Help?</p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Election Support Request")}&body=${encodeURIComponent("Name:\nStudent ID:\nRole:\nIssue:\n")}`}
              className="text-xs font-bold text-white hover:underline truncate block"
            >Contact Support</a>
          </div>
        </div>

        {/* System Status */}
        <div className="flex items-center justify-between px-1 text-[10px] text-sidebar-foreground/45 font-medium">
          <span>System Status</span>
          <span className="flex items-center gap-1.5 text-[#16A34A] font-bold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A] animate-pulse" />
            Online
          </span>
        </div>

        {/* Logout */}
        <button
          onClick={() => {
            logout();
            nav({ to: "/" });
          }}
          className="nav-hover w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-sidebar-foreground/60 hover:bg-white/5 hover:text-white border border-transparent hover:border-white/5 transition-all duration-150"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Logout
        </button>
      </div>
    </aside>
  );
}

function renderLink(
  l: SidebarLink,
  path: string,
  unreadCount: number,
  pendingPhotoCount: number,
  kind: SidebarKind,
  isApproved: boolean,
  profile: any,
  onNavigate?: () => void,
) {
  const active = path === l.to;
  const Icon = l.icon;
  const badgeValue = l.to.endsWith("/notifications") ? unreadCount : l.to.endsWith("/pending-photos") ? pendingPhotoCount : ("badge" in l ? (l.badge ?? 0) : 0);

  const isCampaignTab = [
    "/candidate/manifesto",
    "/candidate/media",
    "/candidate/ai-report",
  ].includes(l.to);
  const isLocked = kind === "candidate" && isCampaignTab && !isApproved;

  const isPartyTab = l.to === "/candidate/party-dashboard";
  const candidateType = (profile as any)?.candidate_type?.toUpperCase() || "INDEPENDENT";
  if (kind === "candidate" && isPartyTab && candidateType !== "PARTY") {
    return null;
  }
  const isPartyLocked = kind === "candidate" && isPartyTab && !isApproved;

  if (isLocked || isPartyLocked) {
    return (
      <button
        key={l.to}
        onClick={() => {
          toast.error(
            `Access Locked. The "${l.label}" will activate once your candidacy is approved by the admin.`,
            { description: `Current Status: ${profile?.status || "Pending review"}` },
          );
        }}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground/25 hover:bg-white/5 hover:text-sidebar-foreground/40 cursor-not-allowed transition-all duration-150"
      >
        <Icon className="h-[18px] w-[18px] opacity-30" />
        <span className="flex-1 text-left opacity-30">{l.label}</span>
        <Lock className="h-3.5 w-3.5 opacity-30" />
      </button>
    );
  }

  return (
    <Link
      key={l.to}
      to={l.to}
      onClick={onNavigate}
      className={cn(
        "nav-hover relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
        active
          ? "bg-[#0F4A40] text-white shadow-[0_0_12px_rgba(15,138,95,0.25)] border border-[#0F8A5F]/20"
          : "text-sidebar-foreground/70 hover:bg-white/8 hover:text-white",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1">{l.label}</span>
      {badgeValue > 0 && (
        <span className="bg-white/20 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
          {badgeValue > 99 ? "99+" : badgeValue}
        </span>
      )}
    </Link>
  );
}
