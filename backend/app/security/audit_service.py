"""Audit service — records all significant system actions."""

from datetime import datetime, timezone
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit_log import AuditLog

class AuditService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(self, event_type: str, actor_id: str = None, description: str = None, ip_address: str = None):
        """Record an audit log entry."""
        actor_uuid = None
        if actor_id:
            try:
                actor_uuid = uuid.UUID(actor_id)
            except ValueError:
                pass
                
        log_entry = AuditLog(
            event_type=event_type,
            actor_id=actor_uuid,
            ip_address=ip_address,
            description=description,
            created_at=datetime.now(timezone.utc),
        )
        self.db.add(log_entry)
        await self.db.commit()
