from sqlalchemy import Column, String, Integer, SmallInteger, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.db.base import Base


class VoteStats(Base):
    __tablename__ = "vote_stats"

    stat_id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    election_id   = Column(UUID(as_uuid=True), ForeignKey("elections.election_id"), nullable=False)
    position_id   = Column(UUID(as_uuid=True), ForeignKey("positions.position_id"), nullable=False)
    department    = Column(String(80))      # aggregated by dept — never individual
    year_of_study = Column(SmallInteger)   # aggregated by year — never individual
    vote_count    = Column(Integer, default=0)
    recorded_at   = Column(TIMESTAMP(timezone=True))

    # relationships
    election = relationship("Election", back_populates="vote_stats")
    position = relationship("Position", back_populates="vote_stats")

    # IMPORTANT: This table stores AGGREGATED counts only.
    # Never store individual voter data here.
    # Used for the statistics dashboard (turnout by dept/year).