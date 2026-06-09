import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Users,
  Vote,
  Bell,
  LayoutDashboard,
  FileEdit,
  Brain,
  ClipboardList,
  Shield,
  BarChart3,
  Cog,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarKind } from "./Sidebar";
import { useNotifications } from "@/context/NotificationStore";
import { useCurrentPhase } from "@/hooks/use-election-data";

const MAP = {
  voter: [
    { to: "/voter/dashboard", label: "Home", icon: Home },
    { to: "/voter/candidates", label: "Candidates", icon: Users },
    { to: "/voter/vote", label: "Vote", icon: Vote },
    { to: "/voter/results", label: "Results", icon: TrendingUp },
    { to: "/voter/notifications", label: "Alerts", icon: Bell },
  ],
  candidate: [
    { to: "/candidate/dashboard", label: "Home", icon: LayoutDashboard },
    { to: "/candidate/manifesto", label: "Edit", icon: FileEdit },
    { to: "/candidate/ai-report", label: "AI", icon: Brain },
    { to: "/candidate/status", label: "Status", icon: ClipboardList },
    { to: "/candidate/notifications", label: "Alerts", icon: Bell },
  ],
  admin: [
    { to: "/admin/dashboard", label: "Home", icon: Shield },
    { to: "/admin/candidates", label: "Cands", icon: Users },
    { to: "/admin/election", label: "Ctrl", icon: Cog },
    { to: "/admin/results", label: "Results", icon: TrendingUp },
    { to: "/admin/ai-monitoring", label: "AI", icon: BarChart3 },
  ],
};

export function MobileBottomNav({ kind }: { kind: SidebarKind }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { data: phaseData } = useCurrentPhase();
  const isVoteOpen = phaseData?.phase === "voting_open";
  
  // Filter out Vote link when voting is not open
  let links = MAP[kind];
  if (kind === "voter") {
    links = links.filter((l) => {
      if (l.to === "/voter/vote") return isVoteOpen;
      return true;
    });
  }
  
  const { unreadCount } = useNotifications();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white/90 backdrop-blur-lg border-t border-gray-200/60 z-30 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-5">
        {links.map((l) => {
          const Icon = l.icon;
          const active = path === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition-all duration-150",
                active ? "text-[#0F8A5F]" : "text-gray-400",
              )}
            >
              {active && (
                <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-[#0F8A5F]" />
              )}
              <span className={cn("p-1.5 rounded-lg transition-all", active && "bg-[#0F8A5F]/10")}>
                <Icon className={cn("h-5 w-5", active && "scale-110")} />
                {l.to.endsWith("/notifications") && unreadCount > 0 && (
                  <span className="absolute top-1 right-6 h-4 min-w-4 px-0.5 text-[10px] font-semibold rounded-full bg-[#DC2626] text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </span>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
