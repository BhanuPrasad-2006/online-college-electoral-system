import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/context/NotificationStore";

function NotifPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useNotifications();
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Election announcements and system updates.
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={markAllNotificationsRead}
          className="text-[#6C63FF] hover:text-[#1F3A6E]"
        >
          <CheckCheck className="h-4 w-4 mr-2" /> Mark all as read
        </Button>
      </div>
      <div className="bg-card rounded-2xl shadow-sm divide-y">
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => markNotificationRead(n.id)}
            className={cn(
              "w-full text-left p-4 flex items-start gap-4 transition-colors hover:bg-muted/50",
              n.unread && "border-l-4 border-[#6C63FF] bg-[#6C63FF]/5",
            )}
          >
            <div className="h-10 w-10 rounded-lg bg-[#6C63FF]/10 text-[#6C63FF] flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">{n.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {n.time} · {n.type}
              </p>
            </div>
            {n.unread && <span className="h-2 w-2 rounded-full bg-[#6C63FF] mt-2" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/candidate/notifications")({ component: NotifPage });
