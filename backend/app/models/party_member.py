import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, PrimaryKeyConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base


class PartyMember(Base):
    __tablename__ = "party_members"

    party_id = Column(
        UUID(as_uuid=True),
        ForeignKey("parties.party_id", ondelete="CASCADE"),
        nullable=False,
    )

    candidate_id = Column(
        UUID(as_uuid=True),
        ForeignKey("candidates.candidate_id", ondelete="CASCADE"),
        nullable=False,
    )

    role = Column(
        String(100),
        nullable=True,
    )

    position = Column(
        String(150),
        nullable=True,
    )

    joined_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    __table_args__ = (
        PrimaryKeyConstraint("party_id", "candidate_id"),
    )

    # ── Relationships ─────────────────────────────────────────
    party = relationship("Party", back_populates="members")

    def __repr__(self):
        return f"<PartyMember party={self.party_id} candidate={self.candidate_id}>"
