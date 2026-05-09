from sqlalchemy import Column, Text, SmallInteger, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base


class Manifesto(Base):
    __tablename__ = "manifestos"

    manifesto_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.candidate_id", ondelete="CASCADE"), nullable=False)
    election_id  = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False)
    content      = Column(Text, nullable=False)   # sanitized via bleach in backend before storage
    version      = Column(SmallInteger, default=1)
    submitted_at = Column(TIMESTAMP(timezone=True))
    updated_at   = Column(TIMESTAMP(timezone=True))

    # relationships
    candidate = relationship("Candidate", back_populates="manifesto")