import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, CHAR
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base


class Vote(Base):
    """
    CRITICAL PRIVACY DESIGN:
    This table has NO voter_id column by design.
    Anonymity is enforced at the schema level — no foreign key to voters table.

    voter_token_hash = SHA-256(random_uuid) generated per vote session.
    The original token is never stored. This hash cannot be reversed.
    """
    __tablename__ = "votes"

    # ── Exact DB columns ─────────────────────────────────────
    vote_id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    voter_token_hash = Column(CHAR(64), unique=True, nullable=False, index=True)
    candidate_id     = Column(String(36), ForeignKey("candidates.candidate_id"), nullable=True, index=True)
    election_id      = Column(String(36), ForeignKey("elections.election_id"), nullable=False, index=True)
    position_id      = Column(String(36), ForeignKey("positions.position_id"), nullable=False, index=True)
    voted_at         = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships (no voter link — intentional) ───────────
    candidate = relationship("Candidate")
    election  = relationship("Election",  back_populates="votes")
    position  = relationship("Position",  back_populates="votes")

    def __repr__(self):
        return f"<Vote election={self.election_id} position={self.position_id}>"