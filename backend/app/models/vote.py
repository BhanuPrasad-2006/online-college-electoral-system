import uuid
from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Vote(Base):
    """
    Vote record — NO voter_id to ensure vote anonymity.
    The vote_hash provides a chain of integrity verification.
    """
    __tablename__ = "votes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)
    candidate_id = Column(UUID(as_uuid=True), ForeignKey("candidates.id"), nullable=False)
    position = Column(String(100), nullable=False)
    vote_hash = Column(String(512), unique=True, nullable=False)
    previous_hash = Column(String(512), nullable=True)
    receipt_hash = Column(String(512), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
