from datetime import datetime
from sqlalchemy import Column, String, DateTime
from app.db.base import Base

class AntiReplayToken(Base):
    __tablename__ = "anti_replay_tokens"

    token = Column(String(255), primary_key=True, index=True)
    user_id = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)

    def __repr__(self) -> str:
        return f"<AntiReplayToken(token={self.token}, user_id={self.user_id}, expires_at={self.expires_at})>"
