import { useMemo, useState, type ReactNode } from "react";
import { NOTIFICATIONS } from "@/lib/mock";
import { NotificationContext, type NotificationItem } from "@/context/NotificationStore";

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>(() =>
    NOTIFICATIONS.map((notification) => ({ ...notification })),
  );

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
