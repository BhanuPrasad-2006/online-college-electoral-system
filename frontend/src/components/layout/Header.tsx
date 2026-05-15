import { Bell, Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ELECTION, NOTIFICATIONS } from "@/lib/mock";
import { useAuth } from "@/context/AuthContext";

export function Header({ onMenu }: { onMenu?: () => void }) {
  const { role } = useAuth();
  const unread = NOTIFICATIONS.filter((n) => n.unread).length;
  const initials = role === "voter" ? "AR" : role === "candidate" ? "PS" : "MI";
  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-border/60 shadow-sm">
      <div className="flex items-center gap-4 px-4 md:px-6 h-16">
        <button onClick={onMenu} className="md:hidden p-2 -ml-2 rounded-lg hover:bg-muted transition-colors active:scale-95">
          <Menu className="h-5 w-5" />
        </button>
        <div className="hidden md:block flex-1" />
        <h1 className="hidden md:block flex-1 text-center text-sm font-semibold text-foreground/90">
          {ELECTION.name}
        </h1>
        <div className="flex-1 md:flex-none flex items-center justify-end gap-2 md:gap-3">
          <Badge variant="secondary" className="capitalize">{role ?? "guest"}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative p-2 rounded-full hover:bg-muted transition-all duration-200 active:scale-95 hover:ring-2 hover:ring-[#6C63FF]/20">
                <Bell className="h-5 w-5 text-foreground/70" />
                {unread > 0 && (
                  <span className="absolute top-0.5 right-0.5 h-4 min-w-4 px-0.5 text-[10px] font-semibold rounded-full bg-destructive text-destructive-foreground flex items-center justify-center animate-pulse">
                    {unread}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {NOTIFICATIONS.slice(0, 5).map((n) => (
                <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 py-2">
                  <span className="text-sm">{n.title}</span>
                  <span className="text-xs text-muted-foreground">{n.time}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Avatar className="h-9 w-9 ring-2 ring-[#6C63FF]/20 transition-transform hover:scale-105 cursor-pointer">
            <AvatarFallback className="bg-gradient-to-br from-[#6C63FF]/20 to-[#1F3A6E]/20 text-[#6C63FF] text-sm font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  );
}
