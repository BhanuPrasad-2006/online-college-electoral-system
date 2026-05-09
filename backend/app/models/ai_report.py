from sqlalchemy import Column, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base


class AIReport(Base):
    __tablename__ = "ai_reports"

    report_id    = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.candidate_id"), nullable=False)
    election_id  = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False)
    report_json  = Column(JSONB, nullable=False)   # top concerns, coverage %, suggestions
    generated_at = Column(TIMESTAMP(timezone=True))

    # relationships
    candidate = relationship("Candidate", back_populates="ai_reports")
    election  = relationship("Election",  back_populates="ai_reports")

    # report_json shape:
    # {
    #   "overall_coverage_percent": 64,
    #   "readability_score": 72,
    #   "top_concerns": [...],
    #   "categories": [{"name": "Wi-Fi", "covered": true, "score": 89}],
    #   "suggested_additions": ["Add mental health support", ...]
    # }