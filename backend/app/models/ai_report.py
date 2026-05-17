import uuid

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class AIReport(Base):
    """AI-generated concern summary report for a specific candidate in an election."""
    __tablename__ = "ai_reports"

    # ── Exact DB columns ─────────────────────────────────────
    report_id    = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    candidate_id = Column(String(36), ForeignKey("candidates.candidate_id"), nullable=False, index=True)
    election_id  = Column(String(36), ForeignKey("elections.election_id"), nullable=False, index=True)
    report_json  = Column(Text, nullable=False, default="{}")
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships ─────────────────────────────────────────
    candidate = relationship("Candidate")
    election  = relationship("Election",  back_populates="ai_reports")

    def __repr__(self):
        return f"<AIReport candidate={self.candidate_id} election={self.election_id}>"
