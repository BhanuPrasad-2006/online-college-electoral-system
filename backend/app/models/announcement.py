import uuid
from sqlalchemy import Column, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.base import Base

class Announcement(Base):
    __tablename__ = "announcements"
    announcement_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    recipients = Column(String(50), nullable=False, default="All Users")
    sent_by = Column(String(100), nullable=True)
    is_published = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    def __repr__(self):
        return f"<Announcement {self.title} [{self.recipients}]>"
