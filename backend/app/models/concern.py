import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Concern(Base):
    __tablename__ = "concerns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), nullable=False)
    status = Column(String(20), default="open", nullable=False)
    upvotes = Column(Integer, default=0)
    user_id = Column(UUID(as_uuid=True), ForeignKey("voters.id"), nullable=False)
    ai_classification = Column(String(100), nullable=True)
    sentiment_score = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
