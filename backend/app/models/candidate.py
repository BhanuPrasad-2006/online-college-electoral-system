import uuid
from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Candidate(Base):
    __tablename__ = "candidates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("voters.id"), nullable=False)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)
    position = Column(String(100), nullable=False)
    status = Column(String(20), default="pending", nullable=False)  # pending, approved, rejected
    statement = Column(String(2000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
