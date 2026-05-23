import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base

class ElectionPhase(Base):
    __tablename__ = "election_phases"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.election_id", ondelete="CASCADE"), nullable=False)
    phase_name  = Column(String(50), nullable=False)
    start_time  = Column(DateTime(timezone=True), nullable=True)
    end_time    = Column(DateTime(timezone=True), nullable=True)
    is_active   = Column(Boolean, default=False, nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    election = relationship("Election", back_populates="phases")

    def __repr__(self):
        return f"<ElectionPhase {self.phase_name} active={self.is_active}>"
