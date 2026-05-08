import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class ClassVoteStats(Base):
    __tablename__ = "class_vote_stats"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)
    department = Column(String(100), nullable=False)
    year = Column(Integer, nullable=False)
    total_eligible = Column(Integer, default=0)
    votes_cast = Column(Integer, default=0)
    participation_rate = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
