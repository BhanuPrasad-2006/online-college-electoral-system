import uuid

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.types import PgEnum
from app.enums.election_status import ElectionStatusEnum


from sqlalchemy.dialects.postgresql import UUID

class Election(Base):
    __tablename__ = "elections"

    # ── Exact DB columns ─────────────────────────────────────
    election_id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title                 = Column(String(200), nullable=False)
    description           = Column(Text, nullable=True)
    registration_start    = Column(DateTime(timezone=True), nullable=True)
    registration_end      = Column(DateTime(timezone=True), nullable=True)
    voting_start          = Column(DateTime(timezone=True), nullable=True)
    voting_end            = Column(DateTime(timezone=True), nullable=True)
    document_deadline     = Column(DateTime(timezone=True), nullable=True)
    eligible_department   = Column(String(100), nullable=True)
    status                = Column(
        PgEnum(ElectionStatusEnum, pg_type_name="election_status"),
        default=ElectionStatusEnum.UPCOMING.value,
        nullable=False,
    )
    result_integrity_hash = Column(String(64), nullable=True)
    results_published     = Column(Boolean, default=False, nullable=False)
    results_published_at  = Column(DateTime(timezone=True), nullable=True)
    created_by            = Column(UUID(as_uuid=True), ForeignKey("admin_users.admin_id"), nullable=True)
    auto_transition       = Column(Boolean, default=True, nullable=False)
    is_paused             = Column(Boolean, default=False, nullable=False)
    created_at            = Column(DateTime(timezone=True), server_default=func.now())

    # ── Relationships ─────────────────────────────────────────
    positions  = relationship("Position",  back_populates="election", cascade="all, delete-orphan")
    candidates = relationship("Candidate", back_populates="election")
    votes      = relationship("Vote",      back_populates="election")
    manifestos = relationship("Manifesto", back_populates="election")
    concerns   = relationship("Concern",   back_populates="election")
    ai_alerts  = relationship("AIAlert",   back_populates="election")
    ai_reports = relationship("AIReport",  back_populates="election")
    phases     = relationship("ElectionPhase", back_populates="election", cascade="all, delete-orphan")
    parties    = relationship("Party", back_populates="election", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Election {self.title} [{self.status}]>"
