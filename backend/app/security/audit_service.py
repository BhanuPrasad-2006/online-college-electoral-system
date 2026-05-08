"""Audit service — records all significant system actions."""

from sqlalchemy.orm import Session
from app.models.audit_log import AuditLog


class AuditService:
    def __init__(self, db: Session):
        self.db = db

    async def log(self, action: str, actor_id: str, resource_type: str, resource_id: str = None,
                  details: dict = None, ip_address: str = None):
        """Record an audit log entry."""
        log_entry = AuditLog(
            action=action,
            actor_id=actor_id,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
            ip_address=ip_address,
        )
        self.db.add(log_entry)
        self.db.commit()
