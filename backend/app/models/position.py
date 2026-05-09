from sqlalchemy import Column, String, Text, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base


class Position(Base):
    __tablename__ = "positions"

    position_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.election_id", ondelete="CASCADE"), nullable=False)
    title       = Column(String(100), nullable=False)
    description = Column(Text)
    created_at  = Column(TIMESTAMP(timezone=True))

    # relationships
    election   = relationship("Election",  back_populates="positions")
    candidates = relationship("Candidate", back_populates="position")
    votes      = relationship("Vote",      back_populates="position")
    vote_stats = relationship("VoteStats", back_populates="position")