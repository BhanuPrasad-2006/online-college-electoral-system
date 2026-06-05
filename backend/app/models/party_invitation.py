import uuid

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.invitation_status import InvitationStatusEnum


class PartyInvitation(Base):
    __tablename__ = "party_invitations"

    invitation_id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    party_id = Column(
        UUID(as_uuid=True),
        ForeignKey("parties.party_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    invited_voter_id = Column(
        UUID(as_uuid=True),
        ForeignKey("voters.voter_id", ondelete="CASCADE"),
        nullable=False,
    )

    invited_by_candidate_id = Column(
        UUID(as_uuid=True),
        ForeignKey("candidates.candidate_id", ondelete="SET NULL"),
        nullable=True,
    )

    role = Column(
        String(100),
        nullable=True,
    )

    position = Column(
        String(150),
        nullable=True,
    )

    status = Column(
        PgEnum(InvitationStatusEnum, pg_type_name="invitation_status"),
        default=InvitationStatusEnum.PENDING.value,
        nullable=False,
    )

    message = Column(
        Text,
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
    )

    responded_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    expires_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    # ── Relationships ─────────────────────────────────────────
    party = relationship("Party", back_populates="invitations")

    def __repr__(self):
        return f"<PartyInvitation {self.invitation_id} status={self.status}>"
