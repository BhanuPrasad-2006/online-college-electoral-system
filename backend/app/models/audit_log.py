import uuid
from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action = Column(String(100), nullable=False, index=True)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("voters.id"), nullable=True)
    resource_type = Column(String(50), nullable=False)
    resource_id = Column(String(255), nullable=True)
    details = Column(JSONB, default={})
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
