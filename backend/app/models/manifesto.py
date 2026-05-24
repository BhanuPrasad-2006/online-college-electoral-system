import uuid

from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.enums.manifesto_status import ManifestoStatusEnum


class Manifesto(Base):
    __tablename__ = "manifestos"

    # ── Exact DB columns ─────────────────────────────────────
    manifesto_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.candidate_id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    election_id  = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False, index=True)
    content      = Column(Text, nullable=False, default="")
    image_url    = Column(String(500), nullable=True)
    version      = Column(Integer, default=1)
    status       = Column(String(20), default=ManifestoStatusEnum.DRAFT.value, nullable=False)
    admin_remarks = Column(String(500), nullable=True)
    reviewed_at   = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())
    # JSON string of AI analysis (contradictions, feasibility, themes, etc.)
    ai_analysis  = Column(Text, nullable=True)

    # ── Relationships ─────────────────────────────────────────
    candidate = relationship("Candidate")
    election  = relationship("Election",  back_populates="manifestos")

    def __repr__(self):
        return f"<Manifesto candidate={self.candidate_id} v{self.version}>"
