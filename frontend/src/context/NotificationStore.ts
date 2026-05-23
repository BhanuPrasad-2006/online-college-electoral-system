import { createContext, useContext } from "react";

export type NotificationItem = {
  id: number;
  title: string;
  time: string;
  unread: boolean;
  type: string;
};

export type NotificationContextValue = {
  notifications: NotificationItem[];
  unreadCount: number;
  markNotificationRead: (id: NotificationItem["id"]) => void;
  markAllNotificationsRead: () => void;
};

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used within a NotificationProvider");
  return context;
}
