import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home, Users, Vote, BarChart2, MessageSquare, Bell, Settings, LogOut,
  LayoutDashboard, FileEdit, Brain, GraduationCap,
  ListChecks, Megaphone, Shield, ScrollText, Activity, Cog,
  Film, MessageSquarePlus, ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const VOTER_LINKS = [
  { to: "/voter/dashboard", label: "Dashboard", icon: Home },
  { to: "/voter/candidates", label: "Candidates & Manifestos", icon: Users },
  { to: "/voter/media", label: "Campaign Gallery", icon: Film },
  { to: "/voter/concerns", label: "Send a Concern", icon: MessageSquarePlus },
  { to: "/voter/vote", label: "Cast My Vote", icon: Vote },
  { to: "/voter/statistics", label: "Statistics", icon: BarChart2 },
  { to: "/voter/ai-assistant", label: "AI Assistant", icon: MessageSquare },
  { to: "/voter/notifications", label: "Notifications", icon: Bell, badge: 2 },
];

const CANDIDATE_LINKS = [
  { to: "/candidate/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/candidate/manifesto", label: "Manifesto Editor", icon: FileEdit },
  { to: "/candidate/media", label: "Campaign Media", icon: Film },
  { to: "/candidate/ai-report", label: "AI Report", icon: Brain },
  { to: "/candidate/status", label: "Manifesto Approval Status", icon: ListChecks },
  { to: "/candidate/notifications", label: "Notifications", icon: Bell, badge: 2 },
];

const ADMIN_LINKS = [
  { to: "/admin/dashboard", label: "Dashboard", icon: Shield },
  { to: "/admin/candidates", label: "Manage Candidates", icon: Users },
  { to: "/admin/media", label: "Content Approval", icon: ShieldCheck },
  { to: "/admin/election", label: "Election Control", icon: Cog },
  { to: "/admin/ai-monitoring", label: "AI Monitoring", icon: Activity },
  { to: "/admin/results", label: "Results", icon: BarChart2 },
  { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
];

export type SidebarKind = "voter" | "candidate" | "admin";

const LINKS_FOR: Record<SidebarKind, typeof VOTER_LINKS> = {
  voter: VOTER_LINKS,
  candidate: CANDIDATE_LINKS,
  admin: ADMIN_LINKS,
};

export function Sidebar({ kind, onNavigate }: { kind: SidebarKind; onNavigate?: () => void }) {
  const links = LINKS_FOR[kind];
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { logout } = useAuth();
  const nav = useNavigate();

  return (
    <aside className="w-[260px] shrink-0 bg-sidebar text-sidebar-foreground h-screen sticky top-0 flex flex-col">
      <div className="px-6 py-5 flex items-center gap-2 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-[#6C63FF] flex items-center justify-center">
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
          return (
            <Link
              key={l.to}
              to={l.to}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-white before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:bg-[#6C63FF] before:rounded-r"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{l.label}</span>
              {"badge" in l && l.badge ? (
                <span className="bg-[#6C63FF] text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                  {l.badge}
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
