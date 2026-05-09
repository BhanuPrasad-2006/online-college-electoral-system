"""AIReport model — stores AI-generated election analysis reports."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base


class AIReport(Base):
    __tablename__ = "ai_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)
    report_type = Column(String(50), nullable=False)  # summary, anomaly, trend, manifesto_analysis
    title = Column(String(255), nullable=False)
    content = Column(JSONB, nullable=False, default={})
    summary = Column(Text, nullable=True)
    generated_at = Column(DateTime, default=datetime.utcnow)
