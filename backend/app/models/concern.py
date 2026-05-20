import uuid

from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.concern_enums import ConcernCategoryEnum, SentimentEnum


class Concern(Base):
    __tablename__ = "concerns"

    # ── Exact DB columns ─────────────────────────────────────
    concern_id   = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    student_id   = Column(String(50), nullable=True, index=True)
    election_id  = Column(String(36), ForeignKey("elections.election_id"), nullable=False, index=True)
    content      = Column(Text, nullable=False)
    category     = Column(PgEnum(ConcernCategoryEnum, pg_type_name="concern_category"), nullable=True)
    priority     = Column(Integer, default=2)
    sentiment    = Column(PgEnum(SentimentEnum, pg_type_name="sentiment_label"), nullable=True)
    cluster_id   = Column(String(36), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships ─────────────────────────────────────────
    election = relationship("Election", back_populates="concerns")

    def __repr__(self):
        return f"<Concern [{self.category}] sentiment={self.sentiment}>"
