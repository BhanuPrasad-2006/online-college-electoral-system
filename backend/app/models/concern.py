import uuid

from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.concern_enums import ConcernCategoryEnum, SentimentEnum


class Concern(Base):
    __tablename__ = "concerns"

    # ── Exact DB columns ─────────────────────────────────────
    concern_id   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id   = Column(UUID(as_uuid=True), nullable=True, index=True)
    election_id  = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False, index=True)
    content      = Column(Text, nullable=False)
    category     = Column(PgEnum(ConcernCategoryEnum, pg_type_name="concern_category"), nullable=True)
    priority     = Column(Integer, default=2)
    sentiment    = Column(PgEnum(SentimentEnum, pg_type_name="sentiment_label"), nullable=True)
    cluster_id   = Column(Integer, nullable=True)
    # Which candidate this concern is directed to (null = general)
    to_candidate_id = Column(String(36), nullable=True, index=True)

    attachment_url = Column(String(500), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    subject = Column(String(150), nullable=True)
    message = Column(Text, nullable=True)
    evidence_url = Column(String(500), nullable=True)
    status = Column(String(50), nullable=True, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships ─────────────────────────────────────────
    election = relationship("Election", back_populates="concerns")

    def __repr__(self):
        return f"<Concern [{self.category}] sentiment={self.sentiment}>"
