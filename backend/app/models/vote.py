from sqlalchemy import Column, String, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base


class Vote(Base):
    """
    CRITICAL ANONYMITY RULE:
    This table has NO voter_id column — enforced at schema level.

    voter_token_hash = SHA-256(random UUID generated at vote time)
    The original token is never stored. Hash is one-way.
    Even with full DB access, no one can link a vote to a voter.

    The only link is voters.has_voted = True (boolean flag only).
    """
    __tablename__ = "votes"

    vote_id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    voter_token_hash = Column(String(64), unique=True, nullable=False)  # SHA-256, NOT voter_id
    candidate_id     = Column(UUID(as_uuid=True), ForeignKey("candidates.candidate_id"), nullable=False)
    election_id      = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False)
    position_id      = Column(UUID(as_uuid=True), ForeignKey("positions.position_id"), nullable=False)
    voted_at         = Column(TIMESTAMP(timezone=True))

    # relationships — NO voter relationship here (intentional)
    candidate = relationship("Candidate", back_populates="votes")
    election  = relationship("Election",  back_populates="votes")
    position  = relationship("Position",  back_populates="votes")