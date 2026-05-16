import { Bell, Menu, UserCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ELECTION } from "@/lib/mock";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationStore";
import { useNavigate } from "@tanstack/react-router";

export function Header({ onMenu }: { onMenu?: () => void }) {
  const { role, logout } = useAuth();
  const { notifications, unreadCount, markNotificationRead, markAllNotificationsRead } =
    useNotifications();
  const nav = useNavigate();

  function goToProfile() {
    if (role === "candidate") nav({ to: "/candidate/settings" });
    else if (role === "admin") nav({ to: "/admin/dashboard" });
    else nav({ to: "/voter/settings" });
  }

  function goToSettings() {
    if (role === "candidate") nav({ to: "/candidate/settings" });
    else if (role === "admin") nav({ to: "/admin/dashboard" });
    else nav({ to: "/voter/settings" });
  }

  function goToChangePassword() {
    goToSettings();
    window.setTimeout(() => {
      document.getElementById("change-password")?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }

  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-border/60 shadow-sm">
      <div className="flex items-center gap-4 px-4 md:px-6 h-16">
        <button
          onClick={onMenu}
          className="md:hidden p-2 -ml-2 rounded-lg hover:bg-muted transition-colors active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden md:block flex-1" />
        <div className="flex-1 md:flex-none flex items-center justify-end gap-2 md:gap-3">
          <h1 className="hidden md:block text-right text-sm font-semibold text-foreground/90 whitespace-nowrap">
            {ELECTION.name}
          </h1>
          <Badge variant="secondary" className="capitalize">
            {role ?? "guest"}
          </Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative p-2 rounded-full hover:bg-muted transition-all duration-200 active:scale-95 hover:ring-2 hover:ring-[#6C63FF]/20">
                <Bell className="h-5 w-5 text-foreground/70" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 h-4 min-w-4 px-0.5 text-[10px] font-semibold rounded-full bg-destructive text-destructive-foreground flex items-center justify-center animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {notifications.slice(0, 5).map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  onClick={() => markNotificationRead(n.id)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className={n.unread ? "text-sm font-semibold text-foreground" : "text-sm"}>
                    {n.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{n.time}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <button
                onClick={markAllNotificationsRead}
                className="w-full px-2 py-2 text-sm font-medium text-[#6C63FF] hover:text-[#1F3A6E] text-left"
              >
                Mark all as read
              </button>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-9 w-9 rounded-full ring-2 ring-[#6C63FF]/20 bg-gradient-to-br from-[#6C63FF]/20 to-[#1F3A6E]/20 text-[#6C63FF] flex items-center justify-center transition-transform hover:scale-105">
                <UserCircle className="h-6 w-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={goToProfile}>Profile</DropdownMenuItem>
              <DropdownMenuItem onClick={goToSettings}>Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={goToChangePassword}>Change Password</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  nav({ to: "/" });
                }}
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
