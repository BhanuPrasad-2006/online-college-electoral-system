import uuid

from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Manifesto(Base):
    __tablename__ = "manifestos"

    # ── Exact DB columns ─────────────────────────────────────
    manifesto_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.candidate_id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    election_id  = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False, index=True)
    content      = Column(Text, nullable=False, default="")
    version      = Column(Integer, default=1)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

    # ── Relationships ─────────────────────────────────────────
    candidate = relationship("Candidate")
    election  = relationship("Election",  back_populates="manifestos")

    def __repr__(self):
        return f"<Manifesto candidate={self.candidate_id} v{self.version}>"
