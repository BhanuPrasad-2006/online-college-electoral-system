"""Notification service — manages in-app and push notifications."""


class NotificationService:
    async def notify_user(self, user_id: str, message: str, notification_type: str = "info"):
        """Send notification to a specific user."""
        # TODO: Store in DB and/or send via WebSocket
        pass

    async def broadcast(self, message: str, role: str = None):
        """Broadcast notification to all users or specific role."""
        pass
