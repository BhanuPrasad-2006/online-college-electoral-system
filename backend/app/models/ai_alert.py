import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base


class AIAlert(Base):
    __tablename__ = "ai_alerts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alert_type = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False)  # low, medium, high, critical
    description = Column(Text, nullable=False)
    metadata = Column(JSONB, default={})
    is_resolved = Column(Boolean, default=False)
    resolved_by = Column(UUID(as_uuid=True), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
