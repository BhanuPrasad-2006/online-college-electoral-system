import { createContext, useContext } from "react";
import { NOTIFICATIONS } from "@/lib/mock";

export type NotificationItem = (typeof NOTIFICATIONS)[number];

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
