from sqlalchemy import Column, String, Text, Integer, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base


class Concern(Base):
    __tablename__ = "concerns"

    concern_id   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    student_id   = Column(UUID(as_uuid=True), ForeignKey("voters.voter_id"))
    election_id  = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"))
    content      = Column(Text, nullable=False)
    category     = Column(String(60))     # AI-assigned: Wi-Fi, Placements, Cafeteria etc.
    priority     = Column(String(20))     # student-selected: low / medium / high
    sentiment    = Column(String(20))     # AI-assigned: positive / neutral / negative
    cluster_id   = Column(Integer)        # AI duplicate grouping id
    submitted_at = Column(TIMESTAMP(timezone=True))

    # relationships
    student  = relationship("Voter",    back_populates="concerns")
    election = relationship("Election", back_populates="concerns")