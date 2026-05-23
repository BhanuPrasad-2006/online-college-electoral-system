import { useMemo, useState, useEffect, type ReactNode } from "react";
import { NotificationContext, type NotificationItem } from "@/context/NotificationStore";
import { useNotifications as useLiveNotifications } from "@/hooks/use-election-data";

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: liveNotifications = [] } = useLiveNotifications();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    // Merge new notifications while keeping local 'unread' state if already marked read
    setNotifications((prev) => {
      const prevReadMap = new Map(prev.filter(n => !n.unread).map(n => [n.id, true]));
      return liveNotifications.map((n: NotificationItem) => ({
        ...n,
        unread: prevReadMap.has(n.id) ? false : n.unread
      }));
    });
  }, [liveNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications],
  );

  function markNotificationRead(id: NotificationItem["id"]) {
    setNotifications((items) =>
      items.map((notification) =>
        notification.id === id ? { ...notification, unread: false } : notification,
      ),
    );
  }

  function markAllNotificationsRead() {
    setNotifications((items) => items.map((notification) => ({ ...notification, unread: false })));
  }

  const value = useMemo(
    () => ({ notifications, unreadCount, markNotificationRead, markAllNotificationsRead }),
    [notifications, unreadCount],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
