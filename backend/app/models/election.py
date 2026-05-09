from sqlalchemy import Column, String, Text, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base
from app.enums.election_status import ElectionStatus



class Election(Base):
    __tablename__ = "elections"

    election_id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title                 = Column(String(200), nullable=False)
    description           = Column(Text)
    registration_start    = Column(TIMESTAMP(timezone=True), nullable=False)
    registration_end      = Column(TIMESTAMP(timezone=True), nullable=False)
    voting_start          = Column(TIMESTAMP(timezone=True), nullable=False)
    voting_end            = Column(TIMESTAMP(timezone=True), nullable=False)
    status                = Column(ElectionStatus, default="UPCOMING")
    result_integrity_hash = Column(String(64))    # SHA-256, locked by DB trigger after publish
    created_by            = Column(UUID(as_uuid=True), ForeignKey("admin_users.admin_id"))
    created_at            = Column(TIMESTAMP(timezone=True))

    # relationships
    created_by_admin = relationship("AdminUser", back_populates="elections")
    positions        = relationship("Position",  back_populates="election", cascade="all, delete")
    candidates       = relationship("Candidate", back_populates="election")
    votes            = relationship("Vote",       back_populates="election")
    concerns         = relationship("Concern",    back_populates="election")
    ai_alerts        = relationship("AIAlert",    back_populates="election")
    ai_reports       = relationship("AIReport",   back_populates="election")
    vote_stats       = relationship("VoteStats",  back_populates="election")