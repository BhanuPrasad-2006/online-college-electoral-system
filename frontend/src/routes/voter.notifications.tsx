import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageLoader } from "@/components/PageLoader";
import { useNotifications } from "@/hooks/use-election-data";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";

function NotifPage() {
  const { data: notifications = [], isPending } = useNotifications();
  const [markAllRead, setMarkAllRead] = useState(false);

  if (isPending) return <PageLoader />;

  const items = notifications.map((n) => ({ ...n, unread: markAllRead ? false : n.unread }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-[28px] font-bold">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">Election announcements and system updates.</p>
        </div>
        <Button variant="outline" onClick={() => setMarkAllRead(true)}>
          <CheckCheck className="h-4 w-4 mr-2" /> Mark All as Read
        </Button>
      </div>
      <div className="bg-card rounded-2xl shadow-sm divide-y">
        {items.map((n) => (
          <div key={n.id} className={cn("p-4 flex items-start gap-4", n.unread && "border-l-4 border-[#6C63FF] bg-[#6C63FF]/5")}>
            <div className="h-10 w-10 rounded-lg bg-[#6C63FF]/10 text-[#6C63FF] flex items-center justify-center shrink-0">
              <Bell className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">{n.title}</p>
              <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/voter/notifications")({ component: NotifPage });
