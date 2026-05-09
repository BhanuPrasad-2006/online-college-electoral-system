from sqlalchemy import Column, String, Boolean, Text, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base
from app.enums.candidate_status import CandidateStatus



class Candidate(Base):
    __tablename__ = "candidates"
    __table_args__ = (
        # One voter can contest only ONE position per election
        UniqueConstraint("voter_id", "election_id", name="uq_one_candidate_per_election"),
    )

    candidate_id     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    voter_id         = Column(UUID(as_uuid=True), ForeignKey("voters.voter_id"), nullable=False)
    election_id      = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False)
    position_id      = Column(UUID(as_uuid=True), ForeignKey("positions.position_id"), nullable=False)
    mobile_number    = Column(String(15))
    mobile_verified  = Column(Boolean, default=False)
    party_symbol_url = Column(Text)
    status           = Column(CandidateStatus, default="PENDING")
    admin_remarks    = Column(Text)
    applied_at       = Column(TIMESTAMP(timezone=True))

    # relationships
    voter     = relationship("Voter",    back_populates="candidate_profile")
    election  = relationship("Election", back_populates="candidates")
    position  = relationship("Position", back_populates="candidates")
    manifesto = relationship("Manifesto", back_populates="candidate", uselist=False)
    votes     = relationship("Vote",      back_populates="candidate")
    ai_reports = relationship("AIReport", back_populates="candidate")