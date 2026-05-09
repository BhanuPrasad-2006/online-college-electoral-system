"""Position model — normalizes election positions into a proper table."""

import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id = Column(UUID(as_uuid=True), ForeignKey("elections.id"), nullable=False)
    title = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    max_winners = Column(Integer, default=1)
    display_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
