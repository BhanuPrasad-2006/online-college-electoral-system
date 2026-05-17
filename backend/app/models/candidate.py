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

    party_symbol_url = Column(
        String(500),
        nullable=True,
    )

    status = Column(
        PgEnum(CandidateStatusEnum, pg_type_name="candidate_status"),
        default=CandidateStatusEnum.PENDING.value,
        nullable=False,
    )

    admin_remarks = Column(
        String(500),
        nullable=True,
    )

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

    # =========================================================
    # STRING REPRESENTATION
    # =========================================================

    def __repr__(self):
        return (
            f"<Candidate "
            f"id={self.candidate_id} "
            f"voter_id={self.voter_id} "
            f"status={self.status}>"
        )