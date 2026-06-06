import uuid

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.party_status import PartyStatusEnum


class Party(Base):
    __tablename__ = "parties"

    party_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    election_id = Column(
        UUID(as_uuid=True),
        ForeignKey("elections.election_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    position_id = Column(
        UUID(as_uuid=True),
        ForeignKey("positions.position_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    leader_candidate_id = Column(
        UUID(as_uuid=True),
        ForeignKey("candidates.candidate_id", ondelete="SET NULL"),
        nullable=True,
    )

    name = Column(
        String(150),
        nullable=False,
        unique=True,
    )

    symbol = Column(
        String(50),
        nullable=True,
    )

    slogan = Column(
        Text,
        nullable=True,
    )

    manifesto = Column(
        Text,
        nullable=True,
    )

    logo_url = Column(
        Text,
        nullable=True,
    )

    status = Column(
        PgEnum(PartyStatusEnum, pg_type_name="party_status"),
        default=PartyStatusEnum.PENDING.value,
        nullable=False,
    )

    admin_remarks = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # ── Relationships ─────────────────────────────────────────
    election = relationship("Election", back_populates="parties")
    members = relationship("PartyMember", back_populates="party", cascade="all, delete-orphan")
    invitations = relationship("PartyInvitation", back_populates="party", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Party {self.name} (status={self.status})>"
