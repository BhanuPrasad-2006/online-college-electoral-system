import uuid

from sqlalchemy import (
    Column,
    String,
    ForeignKey,
    DateTime,
    Boolean,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.candidate_status import CandidateStatusEnum


class Candidate(Base):
    __tablename__ = "candidates"

    # =========================================================
    # PRIMARY KEY
    # =========================================================

    candidate_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # =========================================================
    # FOREIGN KEYS
    # =========================================================

    voter_id = Column(
        UUID(as_uuid=True),
        ForeignKey("voters.voter_id"),
        nullable=False,
        unique=True,
        index=True,
    )

    election_id = Column(
        UUID(as_uuid=True),
        ForeignKey("elections.election_id"),
        nullable=False,
        index=True,
    )

    position_id = Column(
        UUID(as_uuid=True),
        ForeignKey("positions.position_id"),
        nullable=False,
        index=True,
    )

    # =========================================================
    # CANDIDATE DETAILS
    # =========================================================

    mobile_number = Column(
        String(15),
        nullable=True,
    )

    mobile_verified = Column(
        Boolean,
        default=False,
    )

    status = Column(
        PgEnum(CandidateStatusEnum, pg_type_name="candidate_status"),
        default=CandidateStatusEnum.PENDING.value,
        nullable=False,
    )

    is_winner = Column(
        Boolean,
        default=False,
        nullable=False,
    )

    winner_announced_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )


    admin_remarks = Column(
        String(500),
        nullable=True,
    )

    # =========================================================
    # PARTY ARCHITECTURE FIELDS
    # =========================================================

    candidate_type = Column(
        String(20),
        nullable=False,
        default="INDEPENDENT",
        index=True,
    )
    # Values: INDEPENDENT | PARTY

    party_id = Column(
        UUID(as_uuid=True),
        ForeignKey("parties.party_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Set for PARTY candidates, NULL for INDEPENDENT

    party_role = Column(
        String(100),
        nullable=True,
    )
    # e.g. LEADER, CO_LEADER, SECRETARY, TREASURER, MEMBER

    # =========================================================
    # TIMESTAMPS
    # =========================================================

    applied_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    # =========================================================
    # RELATIONSHIPS
    # =========================================================

    voter = relationship(
        "Voter",
        back_populates="candidate_profile",
    )

    election = relationship(
        "Election",
        back_populates="candidates",
    )

    position = relationship(
        "Position",
        back_populates="candidates",
    )

    party = relationship(
        "Party",
        foreign_keys=[party_id],
    )

    # =========================================================
    # STRING REPRESENTATION
    # =========================================================

    def __repr__(self):
        return (
            f"<Candidate "
            f"id={self.candidate_id} "
            f"voter_id={self.voter_id} "
            f"type={self.candidate_type} "
            f"status={self.status}>"
        )