import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Users, Vote, MessageSquare, Bell, LayoutDashboard, FileEdit, Brain, ClipboardList, Shield, BarChart2, Cog, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SidebarKind } from "./Sidebar";

const MAP = {
  voter: [
    { to: "/voter/dashboard", label: "Home", icon: Home },
    { to: "/voter/candidates", label: "Candidates", icon: Users },
    { to: "/voter/vote", label: "Vote", icon: Vote },
    { to: "/voter/ai-assistant", label: "AI", icon: MessageSquare },
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
    { to: "/admin/ai-monitoring", label: "AI", icon: Activity },
    { to: "/admin/results", label: "Results", icon: BarChart2 },
  ],
};

export function MobileBottomNav({ kind }: { kind: SidebarKind }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const links = MAP[kind];
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card border-t border-border z-30">
      <div className="grid grid-cols-5">
        {links.map((l) => {
          const Icon = l.icon;
          const active = path === l.to;
          return (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium",
                active ? "text-[#6C63FF]" : "text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
