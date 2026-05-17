import uuid

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


from sqlalchemy.dialects.postgresql import UUID

class Position(Base):
    __tablename__ = "positions"

    # ── Exact DB columns ─────────────────────────────────────
    position_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.election_id", ondelete="CASCADE"), nullable=False, index=True)
    title       = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships ─────────────────────────────────────────
    election   = relationship("Election",  back_populates="positions")
    candidates = relationship("Candidate", back_populates="position")
    votes      = relationship("Vote",      back_populates="position")

    def __repr__(self):
        return f"<Position {self.title} (election={self.election_id})>"
