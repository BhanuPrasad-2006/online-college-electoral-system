import { Bell, Menu, UserCircle, Shield, ChevronRight, Radio, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationStore";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useVoterProfile, useCandidateProfile } from "@/hooks/use-election-data";
import { resolveVoterPhotoUrl } from "@/lib/api";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const ROUTE_LABELS: Record<string, string> = {
  "/voter/dashboard": "Dashboard",
  "/voter/vote": "Cast Vote",
  "/voter/candidates": "Candidates",
  "/voter/results": "Results",
  "/voter/media": "Campaign Gallery",
  "/voter/concerns": "Send a Concern",
  "/voter/statistics": "Statistics",
  "/voter/notifications": "Notifications",
  "/voter/settings": "Settings",
  "/voter/ai-assistant": "AI Assistant",
  "/admin/dashboard": "Dashboard",
  "/admin/election": "Election Management",
  "/admin/candidates": "Manage Candidates",
  "/admin/parties": "Party Applications",
  "/admin/manifestos": "Manifesto Approval",
  "/admin/media": "Content Approval",
  "/admin/results": "Results",
  "/admin/ai-monitoring": "AI Monitoring",
  "/admin/concerns-clusters": "Concerns Clusters",
  "/admin/campus-report": "Campus Report",
  "/admin/audit-logs": "Audit Logs",
  "/admin/pending-photos": "Pending Photos",
  "/admin/meetings": "Meetings",
  "/admin/notices": "Notices",
  "/admin/announcements": "Announcements",
  "/admin/settings": "Settings",
  "/candidate/dashboard": "Dashboard",
  "/candidate/manifesto": "Manifesto Editor",
  "/candidate/media": "Campaign Media",
  "/candidate/ai-report": "AI Report",
  "/candidate/party-dashboard": "Party Dashboard",
  "/candidate/status": "Application Status",
  "/candidate/concerns": "Student Concerns",
  "/candidate/notifications": "Notifications",
  "/candidate/settings": "Settings",
  "/candidate/apply": "Apply",
  "/candidate/register": "Register",
};

export function Header({ onMenu }: { onMenu?: () => void }) {
  const { role, adminRole, logout } = useAuth();
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } =
    useNotifications();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  // Conditional profiles fetching
  const isVoter = role === "voter";
  const isCandidate = role === "candidate";

  const { data: voterProfile } = useVoterProfile();
  const { data: candidateProfile } = useCandidateProfile();

  const userDetails = useMemo(() => {
    if (isVoter && voterProfile) {
      return {
        name: voterProfile.name || "Voter",
        id: voterProfile.studentId || "VTR",
        avatar: resolveVoterPhotoUrl(voterProfile.voter_id),
      };
    } else if (isCandidate && candidateProfile) {
      return {
        name: candidateProfile.full_name || candidateProfile.name || "Candidate",
        id: candidateProfile.student_id || "CAN",
        avatar: candidateProfile.image_url ? resolveVoterPhotoUrl(candidateProfile.voter_id) : "",
      };
    } else if (role === "admin") {
      const storedName = sessionStorage.getItem("collegevote-full-name") || "Administrator";
      const storedRole = adminRole ? adminRole.replace(/_/g, " ") : "Admin";
      return {
        name: storedName,
        id: storedRole,
        avatar: "",
      };
    }
    return {
      name: "User",
      id: "ID",
      avatar: "",
    };
  }, [role, adminRole, voterProfile, candidateProfile, isVoter, isCandidate]);

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const parts: BreadcrumbItem[] = [];
    if (role) {
      parts.push({ label: role === "voter" ? "Voter Portal" : role === "candidate" ? "Candidate Portal" : "Admin Portal" });
    }
    const pageLabel = ROUTE_LABELS[path] || "Page";
    if (pageLabel) {
      parts.push({ label: pageLabel });
    }
    return parts;
  }, [role, path]);

  function goToProfile() {
    if (role === "candidate") nav({ to: "/candidate/settings" });
    else if (role === "admin") nav({ to: "/admin/settings" });
    else nav({ to: "/voter/settings" });
  }

  function goToSettings() {
    if (role === "candidate") nav({ to: "/candidate/settings" });
    else if (role === "admin") nav({ to: "/admin/settings" });
    else nav({ to: "/voter/settings" });
  }

  function goToChangePassword() {
    goToSettings();
    window.setTimeout(() => {
      document.getElementById("change-password")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  return (
    <header className="glass-header sticky top-0 z-35">
      <div className="flex items-center gap-4 px-4 md:px-6 h-16">
        {/* Mobile menu trigger */}
        <button
          onClick={onMenu}
          className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-150 transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5 text-[#102A27]" />
        </button>

        {/* Breadcrumb navigation */}
        <nav className="hidden md:flex items-center gap-1.5 text-sm flex-1 min-w-0">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
              <span
                className={
                  i === breadcrumbs.length - 1
                    ? "font-semibold text-[#102A27]"
                    : "text-muted-foreground"
                }
              >
                {crumb.label}
              </span>
            </span>
          ))}
        </nav>

        {/* Right section */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Election is Live Badge */}
          <Badge
            variant="outline"
            className="border-[#16A34A]/25 bg-[#16A34A]/8 text-[#16A34A] text-xs font-semibold px-3 py-1 flex items-center gap-1.5 rounded-full"
          >
            Election is Live
            <Radio className="h-3 w-3 text-[#16A34A]" />
          </Badge>

          {/* Notifications */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative p-2 rounded-full hover:bg-[#E6ECE9] transition-all duration-150" aria-label="Notifications">
                <Bell className="h-5 w-5 text-[#102A27]" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-4 min-w-4 px-1 text-[10px] font-bold rounded-full bg-[#16A34A] text-white flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 rounded-2xl p-2 border-[#E6ECE9] shadow-lg bg-white">
              <DropdownMenuLabel className="text-[#102A27] px-3 py-2 text-sm font-bold">Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-[#E6ECE9]" />
              <div className="max-h-60 overflow-y-auto py-1">
                {notifications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">No new notifications.</div>
                ) : (
                  notifications.slice(0, 5).map((n) => (
                    <DropdownMenuItem
                      key={n.id}
                      onClick={() => markNotificationRead(n.id)}
                      className="flex flex-col items-start gap-1 py-2.5 px-3 rounded-xl hover:bg-muted/50 cursor-pointer"
                    >
                      <span className={n.unread ? "text-xs font-bold text-[#102A27]" : "text-xs text-[#5E6D68]"}>
                        {n.title}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{n.time}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
              <DropdownMenuSeparator className="bg-[#E6ECE9]" />
              <button
                onClick={markAllNotificationsRead}
                className="w-full px-3 py-2 text-xs font-semibold text-[#0F8A5F] hover:text-[#16A34A] text-left transition-colors"
              >
                Mark all as read
              </button>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User profile dropdown pill */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-[#E6ECE9] transition-all duration-150 text-left border border-transparent hover:border-[#E6ECE9] cursor-pointer" aria-label="User menu">
                <Avatar className="h-8 w-8 rounded-full ring-2 ring-[#0F8A5F]/20">
                  {userDetails.avatar && (
                    <AvatarImage
                      src={userDetails.avatar}
                      alt={userDetails.name}
                      className="object-cover"
                    />
                  )}
                  <AvatarFallback className="bg-[#0F8A5F]/10 text-[#0F8A5F] font-extrabold text-xs">
                    {userDetails.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block leading-tight">
                  <p className="text-xs font-bold text-[#102A27]">{userDetails.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{userDetails.id}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-1" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 rounded-2xl p-1.5 border-[#E6ECE9] shadow-lg bg-white">
              <DropdownMenuItem onClick={goToProfile} className="rounded-xl hover:bg-muted/50 px-3 py-2 text-xs font-medium">Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={goToSettings} className="rounded-xl hover:bg-muted/50 px-3 py-2 text-xs font-medium">Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={goToChangePassword} className="rounded-xl hover:bg-muted/50 px-3 py-2 text-xs font-medium">Change Password</DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#E6ECE9]" />
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  nav({ to: "/" });
                }}
                className="rounded-xl hover:bg-destructive/5 text-danger px-3 py-2 text-xs font-semibold"
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
