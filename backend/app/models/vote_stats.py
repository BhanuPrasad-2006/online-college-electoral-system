import uuid

from sqlalchemy import Column, String, Integer, SmallInteger, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.db.base import Base


class VoteStats(Base):
    __tablename__ = "vote_stats"

    # ── Exact DB columns ─────────────────────────────────────
    stat_id       = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    election_id   = Column(String(36), ForeignKey("elections.election_id"), nullable=False, index=True)
    position_id   = Column(String(36), ForeignKey("positions.position_id"), nullable=False, index=True)
    department    = Column(String(80), nullable=True)
    year_of_study = Column(SmallInteger, nullable=True)
    vote_count    = Column(Integer, default=0)
    recorded_at   = Column(DateTime(timezone=True), server_default=func.now())

    # IMPORTANT: This table stores AGGREGATED counts only.
    # Never store individual voter data here.
    # Used for the statistics dashboard (turnout by dept/year).

    def __repr__(self):
        return f"<VoteStats election={self.election_id} dept={self.department} count={self.vote_count}>"