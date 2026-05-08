import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base


class Manifesto(Base):
    __tablename__ = "manifestos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.id"), unique=True, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    goals = Column(JSONB, default=[])
    ai_sentiment_score = Column(Float, nullable=True)
    ai_feasibility_score = Column(Float, nullable=True)
    ai_key_themes = Column(JSONB, default=[])
    ai_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
