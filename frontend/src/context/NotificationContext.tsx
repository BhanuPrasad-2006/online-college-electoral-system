import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { NotificationContext, type NotificationItem } from "@/context/NotificationStore";
import { useNotifications as useLiveNotifications } from "@/hooks/use-election-data";

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: liveNotifications = [] } = useLiveNotifications();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Use a ref + JSON stringify to stabilize the liveNotifications reference.
  // This prevents infinite re-render loops when react-query polling returns
  // a new array reference with the same data (e.g., when components re-mount).
  const liveStrRef = useRef(JSON.stringify(liveNotifications));
  useEffect(() => {
    const nextStr = JSON.stringify(liveNotifications);
    if (nextStr === liveStrRef.current) return; // no actual changes
    liveStrRef.current = nextStr;

    // Merge new notifications while keeping local 'unread' state if already marked read
    setNotifications((prev) => {
      const prevReadMap = new Map(prev.filter((n) => !n.unread).map((n) => [n.id, true]));
      return liveNotifications.map((n: NotificationItem) => ({
        ...n,
        unread: prevReadMap.has(n.id) ? false : n.unread,
      }));
    });
  }, [liveNotifications]);

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread).length,
    [notifications],
  );

  const markNotificationRead = useMemo(
    () => (id: NotificationItem["id"]) => {
      setNotifications((items) =>
        items.map((notification) =>
          notification.id === id ? { ...notification, unread: false } : notification,
        ),
      );
    },
    [],
  );

  const markAllNotificationsRead = useMemo(
    () => () => {
      setNotifications((items) => items.map((notification) => ({ ...notification, unread: false })));
    },
    [],
  );

  const value = useMemo(
    () => ({ notifications, unreadCount, markNotificationRead, markAllNotificationsRead }),
    [notifications, unreadCount, markNotificationRead, markAllNotificationsRead],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
